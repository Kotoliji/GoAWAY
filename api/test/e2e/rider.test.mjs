// Rider flow: quote, nearby cars, live driver position, final fare inside the
// quote, one rating per trip, history, free cancellation before assignment.
import { test } from 'node:test';
import { call, check, listen, qs, signupClient, signupDriver, sleep } from './helpers.mjs';

const O = { lat: 38.7223, long: -9.1393 }; // Lisbon
const D = { lat: 38.7369, long: -9.1427 };

test('rider flow', async (t) => {
  const C = await signupClient('rid', 'Rita Rider');
  const drv = await signupDriver('lx', { brand: 'Toyota', model: 'Corolla', fuelType: 'Hybrid' }, 'Duarte Driver');

  const q = { originLat: O.lat, originLong: O.long, destLat: D.lat, destLong: D.long, vehicleType: 'NOAI' };
  let r = await call('GET', '/rides/quote' + qs(q), C);
  await check(t, 'quote: distance and fare range, nobody nearby', r.status === 200 && r.body.km > 1 && r.body.fareMax >= r.body.fareMin && r.body.driversNearby === 0, JSON.stringify(r.body));

  await call('POST', '/driver/online', drv.token, { lat: 38.724, long: -9.14 });
  r = await call('GET', '/rides/quote' + qs(q), C);
  const quote = r.body;
  await check(t, 'quote sees the new driver nearby', quote.driversNearby === 1 && quote.nearestKm < 1, JSON.stringify(quote));
  r = await call('GET', '/rides/nearby' + qs({ lat: O.lat, long: O.long }), C);
  await check(t, 'nearby cars for the map', r.body.drivers.length === 1);
  r = await call('GET', '/rides/quote' + qs({ ...q, destLat: 'x' }), C);
  await check(t, 'bad quote input -> 400', r.status === 400);

  r = await call('POST', '/rides', C, { originLat: O.lat, originLong: O.long, destName: 'Marques de Pombal', destLat: D.lat, destLong: D.long });
  const ride = r.body.ride;
  await check(t, 'ride assigned, vehicle shown', ride.STATUS === 'ASSIGNED' && ride.VEHICLE_DESC === 'Toyota Corolla');
  r = await call('GET', '/rides/current', C);
  await check(t, 'current ride can be resumed', r.body.ride?.REQUEST_ID === ride.REQUEST_ID);
  r = await call('GET', `/rides/${ride.REQUEST_ID}/estimate`, C);
  await check(t, 'cancellation fee applies once assigned (FN_CANCEL_FEE)', r.body.cancelFee > 0, `fee ${r.body.cancelFee}`);

  const rider = await listen(C);
  rider.socket.emit('ride:watch', { rideId: ride.REQUEST_ID });
  const ds = await listen(drv.token);
  await sleep(300);
  ds.socket.emit('driver:location', { lat: 38.723, long: -9.1396 });
  await sleep(500);
  await check(t, 'rider receives the live driver position', rider.moves.at(-1)?.lat === 38.723, JSON.stringify(rider.moves.at(-1)));

  for (const a of ['accept', 'pickup']) await call('POST', `/rides/${ride.REQUEST_ID}/${a}`, drv.token, {});
  r = await call('POST', `/rides/${ride.REQUEST_ID}/cancel`, C);
  await check(t, 'no cancelling once the passenger is on board (409)', r.status === 409, r.body?.error);
  await call('POST', `/rides/${ride.REQUEST_ID}/complete`, drv.token, {});
  r = await call('GET', `/rides/${ride.REQUEST_ID}`, C);
  const done = r.body.ride;
  await check(t, 'completed with final fare and distance', done.STATUS === 'COMPLETED' && done.FARE > 0 && done.TRIP_KM > 0);
  await check(t, 'final fare is inside the quoted range', done.FARE >= quote.fareMin && done.FARE <= quote.fareMax, `${quote.fareMin} <= ${done.FARE} <= ${quote.fareMax}`);

  r = await call('POST', `/rides/${ride.REQUEST_ID}/rate`, C, { score: 4, comment: 'smooth' });
  await check(t, 'rate the trip', r.status === 201);
  r = await call('POST', `/rides/${ride.REQUEST_ID}/rate`, C, { score: 1 });
  await check(t, 'second rating refused (409, uq_client_rating_trip)', r.status === 409);
  r = await call('GET', `/rides/${ride.REQUEST_ID}`, C);
  await check(t, 'ride carries my rating', r.body.ride.RATING === 4);

  r = await call('GET', '/rides/history', C);
  const h = r.body.rides.find((x) => x.REQUEST_ID === ride.REQUEST_ID);
  await check(t, 'client history', h && h.FARE === done.FARE && h.OTHER_NAME === 'Duarte Driver' && h.RATING === 4);
  r = await call('GET', '/rides/history', drv.token);
  await check(t, 'driver history', r.body.rides.some((x) => x.REQUEST_ID === ride.REQUEST_ID && x.OTHER_NAME === 'Rita Rider'));

  await call('POST', '/driver/offline', drv.token);
  r = await call('POST', '/rides', C, { originLat: O.lat, originLong: O.long, destLat: D.lat, destLong: D.long });
  const waiting = r.body.ride;
  await check(t, 'no driver free -> stays REQUESTED', r.body.allocated === false && waiting.STATUS === 'REQUESTED');
  r = await call('GET', `/rides/${waiting.REQUEST_ID}/estimate`, C);
  await check(t, 'cancelling is free while REQUESTED', r.body.cancelFee === 0);
  r = await call('POST', `/rides/${waiting.REQUEST_ID}/cancel`, C);
  await check(t, 'cancelled without a fee', r.body.ride.STATUS === 'CANCELLED' && r.body.ride.PROPOSED_VALUE === 0);
  r = await call('GET', '/rides/current', C);
  await check(t, 'no current ride after cancelling', r.body.ride === null);

  rider.socket.close();
  ds.socket.close();
});
