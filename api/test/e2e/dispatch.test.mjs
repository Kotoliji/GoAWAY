// Waiting requests are offered to a driver as soon as they become free.
import { test } from 'node:test';
import { call, check, signupClient, signupDriver } from './helpers.mjs';

const P = { lat: 38.57, long: -7.91 }; // Évora

test('dispatch of waiting requests', async (t) => {
  const A = await signupClient('dsp-a');
  const B = await signupClient('dsp-b');
  const D = await signupDriver('ds', { fuelType: 'Diesel', brand: 'Peugeot', model: '308' });
  await call('POST', '/driver/online', D.token, P);

  const r1 = (await call('POST', '/rides', A, { originLat: P.lat, originLong: P.long, destLat: 38.58, destLong: -7.92 })).body.ride;
  const r2 = (await call('POST', '/rides', B, { originLat: P.lat, originLong: P.long, destLat: 38.56, destLong: -7.90 })).body.ride;
  await check(t, 'first ride goes to the only driver', r1.DRIVER_ID === D.id);
  await check(t, 'second ride waits while that driver is busy', r2.STATUS === 'REQUESTED');

  for (const a of ['accept', 'pickup', 'complete']) await call('POST', `/rides/${r1.REQUEST_ID}/${a}`, D.token, {});
  const after = (await call('GET', `/rides/${r2.REQUEST_ID}`, B)).body.ride;
  await check(t, 'freed driver gets the waiting ride right after completing', after.STATUS === 'ASSIGNED' && after.DRIVER_ID === D.id, `${after.STATUS} driver ${after.DRIVER_ID}`);

  await call('POST', `/rides/${r2.REQUEST_ID}/cancel`, B);
  await call('POST', '/driver/offline', D.token);
});
