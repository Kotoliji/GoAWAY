// Driver flow: online, assignment push, reject + re-assignment, accept, pickup,
// complete, no double assignment, going offline with a held ride.
import { test } from 'node:test';
import { call, check, listen, signupClient, signupDriver, sleep } from './helpers.mjs';

const P = { lat: 41.15, long: -8.61 }; // Porto

test('driver flow', async (t) => {
  const C = await signupClient('drv-a');
  const C2 = await signupClient('drv-b');
  const D1 = await signupDriver('dp');
  const D2 = await signupDriver('dq');
  const [sc, s1, s2] = await Promise.all([listen(C), listen(D1.token), listen(D2.token)]);

  let r = await call('POST', '/driver/online', D1.token, P);
  await check(t, 'D1 goes online', r.status === 200 && r.body.driver.STATUS === 'AVAILABLE');
  r = await call('POST', '/driver/online', D2.token, { lat: 41.1506, long: -8.6106 });
  await check(t, 'D2 goes online', r.status === 200);

  r = await call('POST', '/rides', C, { originLat: P.lat, originLong: P.long, destName: 'Ribeira', destLat: 41.161, destLong: -8.618 });
  const ride = r.body.ride;
  await check(t, 'ride goes to the nearest new driver (D1)', r.status === 201 && ride.DRIVER_ID === D1.id, `driver ${ride?.DRIVER_ID}`);
  await sleep(300);
  await check(t, 'D1 gets the ride:updated push', s1.rides.some((e) => e.REQUEST_ID === ride.REQUEST_ID && e.STATUS === 'ASSIGNED'));
  await check(t, 'client gets the ride:updated push', sc.rides.some((e) => e.REQUEST_ID === ride.REQUEST_ID));

  r = await call('POST', `/rides/${ride.REQUEST_ID}/reject`, D1.token);
  await check(t, 'D1 declines', r.status === 200);
  r = await call('GET', `/rides/${ride.REQUEST_ID}`, C);
  await check(t, 'request re-assigned to D2', r.body.ride.DRIVER_ID === D2.id && r.body.ride.STATUS === 'ASSIGNED', `driver ${r.body.ride.DRIVER_ID}`);
  await sleep(300);
  await check(t, 'D2 gets the re-assignment push', s2.rides.some((e) => e.REQUEST_ID === ride.REQUEST_ID && e.DRIVER_ID === D2.id));
  r = await call('POST', `/rides/${ride.REQUEST_ID}/reject`, D1.token);
  await check(t, 'D1 can no longer touch it (403)', r.status === 403);

  r = await call('GET', '/driver/state', D2.token);
  await check(t, 'D2 state shows the ride and an estimate', r.body.ride?.REQUEST_ID === ride.REQUEST_ID && r.body.estimate?.fare > 0);

  r = await call('POST', `/rides/${ride.REQUEST_ID}/accept`, D2.token);
  await check(t, 'D2 accepts', r.status === 200 && r.body.ride.STATUS === 'ACCEPTED');
  r = await call('POST', `/rides/${ride.REQUEST_ID}/pickup`, D2.token);
  await check(t, 'D2 picks up', r.status === 200 && r.body.ride.STATUS === 'PICKED_UP');
  r = await call('POST', '/driver/offline', D2.token);
  await check(t, 'no going offline mid-trip (409, update_status)', r.status === 409, r.body?.error);
  r = await call('POST', `/rides/${ride.REQUEST_ID}/complete`, D2.token, {});
  await check(t, 'D2 completes; fare from distance x tariff', r.status === 200 && r.body.ride.STATUS === 'COMPLETED' && r.body.estimate.fare > 0);

  r = await call('GET', '/driver/state', D2.token);
  const d = r.body.driver;
  await check(t, 'D2 is free again, trip and earnings counted', r.body.ride === null && d.STATUS === 'AVAILABLE' && d.TRIPS_TODAY === 1 && d.EARNED_TODAY > 0,
    `${d.STATUS} trips ${d.TRIPS_TODAY} earned ${d.EARNED_TODAY}`);
  r = await call('POST', `/rides/${ride.REQUEST_ID}/rate`, C, { score: 5, comment: 'great' });
  await check(t, 'client rates the trip', r.status === 201);
  await sleep(300);
  const seen = sc.rides.filter((e) => e.REQUEST_ID === ride.REQUEST_ID).map((e) => e.STATUS);
  await check(t, 'client saw every status live', ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'COMPLETED'].every((x) => seen.includes(x)), seen.join(' > '));

  // a driver holding a ride is not offered a second one
  r = await call('POST', '/rides', C, { originLat: P.lat, originLong: P.long, destLat: 41.16, destLong: -8.62 });
  const r2 = r.body.ride;
  await check(t, '2nd ride goes to D1 (no trips yet)', r2.DRIVER_ID === D1.id, `driver ${r2.DRIVER_ID}`);
  r = await call('POST', '/rides', C2, { originLat: P.lat, originLong: P.long, destLat: 41.16, destLong: -8.62 });
  const r3 = r.body.ride;
  await check(t, '3rd ride is NOT given to busy D1', r3.DRIVER_ID !== D1.id, `driver ${r3.DRIVER_ID}`);

  // offline while holding an ASSIGNED ride: released and re-dispatched
  s1.rides.length = 0;
  r = await call('POST', '/driver/offline', D1.token);
  await check(t, 'D1 goes offline', r.status === 200 && r.body.driver.STATUS === 'OFFLINE');
  r = await call('GET', `/rides/${r2.REQUEST_ID}`, C);
  await check(t, 'the ride D1 held is released', r.body.ride.DRIVER_ID !== D1.id);
  await sleep(300);
  await check(t, 'D1 is told it lost the ride', s1.rides.some((e) => e.REQUEST_ID === r2.REQUEST_ID));

  r = await call('POST', '/driver/online', C, P);
  await check(t, 'a client cannot use the driver API (403)', r.status === 403);

  // leave nothing behind
  await call('POST', '/driver/offline', D2.token);
  for (const [tok, id] of [[C, r2.REQUEST_ID], [C2, r3.REQUEST_ID]]) await call('POST', `/rides/${id}/cancel`, tok);
  [sc, s1, s2].forEach((x) => x.socket.close());
});
