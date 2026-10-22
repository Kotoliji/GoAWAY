// Admin: disable / re-enable a driver, payouts, cancela_motoristas, reports, access.
import { test } from 'node:test';
import { call, check, login, signupClient, signupDriver } from './helpers.mjs';

const P = { lat: 37.02, long: -7.93 }; // Faro

test('admin actions', async (t) => {
  const A = await login('admin@tvdept.pt');
  const C = await signupClient('adm');
  const D = await signupDriver('fa', { fuelType: 'Gasoline', brand: 'Seat', model: 'Leon' });

  await call('POST', '/driver/online', D.token, P);
  const ride = (await call('POST', '/rides', C, { originLat: P.lat, originLong: P.long, destLat: 37.03, destLong: -7.94 })).body.ride;
  await check(t, 'ride assigned to the driver', ride.DRIVER_ID === D.id);

  let r = await call('POST', `/admin/drivers/${D.id}/status`, A, { status: 'DISABLED' });
  await check(t, 'admin disables a driver holding a ride', r.status === 200);
  r = await call('GET', `/rides/${ride.REQUEST_ID}`, C);
  await check(t, 'their ride goes back to the queue', r.body.ride.DRIVER_ID == null && r.body.ride.STATUS === 'REQUESTED');
  r = await call('POST', '/driver/online', D.token, P);
  await check(t, 'a disabled driver cannot go online (403)', r.status === 403);

  await call('POST', `/admin/drivers/${D.id}/status`, A, { status: 'OFFLINE' });
  r = await call('POST', '/driver/online', D.token, P);
  await check(t, 're-enabled driver goes online', r.status === 200);
  r = await call('GET', `/rides/${ride.REQUEST_ID}`, C);
  await check(t, 'the waiting ride is offered to them again', r.body.ride.DRIVER_ID === D.id);

  await call('POST', `/rides/${ride.REQUEST_ID}/accept`, D.token);
  await call('POST', `/rides/${ride.REQUEST_ID}/pickup`, D.token);
  r = await call('POST', `/admin/drivers/${D.id}/status`, A, { status: 'DISABLED' });
  await check(t, 'cannot disable mid-trip (409)', r.status === 409);
  await call('POST', `/rides/${ride.REQUEST_ID}/complete`, D.token, {});

  r = await call('GET', '/admin/drivers', A);
  await check(t, 'unpaid balance shows the fare', r.body.drivers.find((d) => d.DRIVER_ID === D.id).UNPAID > 0);
  r = await call('POST', '/admin/payments/run', A, { minAmount: 0, minDays: 0 });
  const paid = r.body.created.find((p) => p.DRIVER_ID === D.id);
  await check(t, 'payout = billed - commission (paga_aos_motoristas)', paid && Math.abs(paid.NET_VALUE - (paid.VALUE - paid.COMMISSION)) < 0.01);
  r = await call('GET', '/admin/drivers', A);
  await check(t, 'nothing unpaid after the run', r.body.drivers.find((d) => d.DRIVER_ID === D.id).UNPAID === 0);

  r = await call('POST', '/admin/drivers/deactivate-low-rated', A, { vehicleType: 'NOAI', from: '2024-01-01', to: '2026-12-31' });
  await check(t, 'cancela_motoristas runs', r.status === 200 && Array.isArray(r.body.disabled));
  r = await call('POST', '/admin/drivers/deactivate-low-rated', A, { vehicleType: 'NOAI', from: '2026-12-31', to: '2024-01-01' });
  await check(t, 'reversed period -> 400', r.status === 400);

  r = await call('GET', '/admin/overview', A);
  await check(t, 'overview: KPIs and 24 months', r.status === 200 && r.body.monthly.length === 24 && r.body.kpi.CLIENTS > 0);
  r = await call('GET', '/admin/reports', A);
  const keys = r.body.reports.map((x) => x.key);
  const reports = await Promise.all(keys.map((k) => call('GET', `/admin/reports/${k}`, A)));
  await check(t, 'all analytical views load', keys.length === 13 && reports.every((x) => x.status === 200 && x.body.columns.length > 0));

  r = await call('POST', `/admin/drivers/${D.id}/status`, C, { status: 'DISABLED' });
  await check(t, 'a client cannot use the admin API (403)', r.status === 403);

  await call('POST', '/driver/offline', D.token);
});
