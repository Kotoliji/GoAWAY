import { Router, Request } from 'express';
import { z } from 'zod';
import * as svc from './rides.service';
import { requireAuth, requireRole } from '../../auth/auth.middleware';
import { HttpError } from '../../common/errors';
import { parse } from '../../common/validate';
import { notifyRide } from '../../realtime/notify';
import { dispatchPending, tryAllocate } from './dispatch';

export const ridesRouter = Router();

const createSchema = z.object({
  originAddress: z.string().max(200).optional(),
  // rider's current position = pickup point (stored on the client row)
  originLat: z.coerce.number().min(-90).max(90).optional(),
  originLong: z.coerce.number().min(-180).max(180).optional(),
  destName: z.string().max(200).optional(),
  destLat: z.coerce.number().optional(),
  destLong: z.coerce.number().optional(),
  vehicleType: z.enum(['AI', 'NOAI']).default('NOAI'),
  fuelType: z.string().max(30).optional(),
  radiusKm: z.coerce.number().positive().max(200).default(50),
});

/** Throw 404/403 unless the user may see this ride. */
async function loadAuthorized(req: Request, id: number): Promise<svc.RideRow> {
  const ride = await svc.getRide(id);
  if (!ride) throw new HttpError(404, 'Ride not found');
  const u = req.user!;
  const allowed =
    u.role === 'ADMIN' ||
    (u.clientId != null && u.clientId === ride.CLIENT_ID) ||
    (u.driverId != null && u.driverId === ride.DRIVER_ID);
  if (!allowed) throw new HttpError(403, 'Forbidden');
  return ride;
}

// POST /rides  — a client requests a ride
ridesRouter.post('/', requireAuth, requireRole('CLIENT'), async (req, res, next) => {
  try {
    const b = parse(createSchema, req.body);
    const clientId = req.user!.clientId;
    if (clientId == null) throw new HttpError(400, 'Account is not linked to a client');
    if (b.originLat != null && b.originLong != null) {
      await svc.setClientLocation(clientId, b.originLat, b.originLong);
    }

    const id = await svc.createRequest({
      clientId,
      originAddress: b.originAddress,
      destName: b.destName,
      destLat: b.destLat,
      destLong: b.destLong,
      vehicleType: b.vehicleType,
      fuelType: b.fuelType,
    });

    // no driver available -> the request stays REQUESTED until one comes online
    const allocated = await tryAllocate(id, b.radiusKm);

    const ride = await svc.getRide(id);
    if (allocated) notifyRide(ride);
    res.status(201).json({ allocated, ride });
  } catch (err) {
    next(err);
  }
});

const pointSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  long: z.coerce.number().min(-180).max(180),
});

const quoteSchema = z.object({
  originLat: z.coerce.number().min(-90).max(90),
  originLong: z.coerce.number().min(-180).max(180),
  destLat: z.coerce.number().min(-90).max(90),
  destLong: z.coerce.number().min(-180).max(180),
  vehicleType: z.enum(['AI', 'NOAI']).default('NOAI'),
});

// (fixed paths first, so they are not taken for a ride id)

// GET /rides/quote — distance, fare range and free drivers nearby, before ordering
ridesRouter.get('/quote', requireAuth, async (req, res, next) => {
  try {
    const q = parse(quoteSchema, req.query);
    res.json(await svc.quote(q.originLat, q.originLong, q.destLat, q.destLong, q.vehicleType));
  } catch (err) {
    next(err);
  }
});

// GET /rides/nearby?lat&long — free drivers' positions around a point
ridesRouter.get('/nearby', requireAuth, async (req, res, next) => {
  try {
    const q = parse(pointSchema, req.query);
    res.json({ drivers: await svc.nearbyDrivers(q.lat, q.long) });
  } catch (err) {
    next(err);
  }
});

// GET /rides/current — the client's live ride, if any
ridesRouter.get('/current', requireAuth, requireRole('CLIENT'), async (req, res, next) => {
  try {
    const id = await svc.currentClientRideId(req.user!.clientId!);
    res.json({ ride: id != null ? await svc.getRide(id) : null });
  } catch (err) {
    next(err);
  }
});

// GET /rides/history — a client's requests, or a driver's trips (latest 50)
ridesRouter.get('/history', requireAuth, requireRole('CLIENT', 'DRIVER'), async (req, res, next) => {
  try {
    res.json({ rides: await svc.history(req.user!) });
  } catch (err) {
    next(err);
  }
});

// GET /rides/:id — status + assigned driver
ridesRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ride = await loadAuthorized(req, id);
    res.json({ ride });
  } catch (err) {
    next(err);
  }
});

// GET /rides/:id/estimate — distance + fare
ridesRouter.get('/:id/estimate', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await loadAuthorized(req, id);
    const est = await svc.estimate(id);
    if (!est) throw new HttpError(404, 'Ride not found');
    res.json(est);
  } catch (err) {
    next(err);
  }
});

// POST /rides/:id/cancel — client cancels
ridesRouter.post('/:id/cancel', requireAuth, requireRole('CLIENT'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ride = await loadAuthorized(req, id); // also enforces ownership for clients
    if (ride.CLIENT_ID !== req.user!.clientId) throw new HttpError(403, 'Forbidden');
    await svc.cancel(id);
    const updated = await svc.getRide(id);
    notifyRide(updated, ride.DRIVER_ID != null ? [ride.DRIVER_ID] : []);
    if (ride.DRIVER_ID != null) await dispatchPending(); // that driver is free again
    res.json({ ride: updated });
  } catch (err) {
    next(err);
  }
});

// POST /rides/:id/accept — assigned driver accepts
ridesRouter.post('/:id/accept', requireAuth, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ride = await svc.getRide(id);
    if (!ride) throw new HttpError(404, 'Ride not found');
    if (ride.DRIVER_ID !== req.user!.driverId) throw new HttpError(403, 'Not your ride');
    const ok = await svc.accept(id, req.user!.driverId!);
    if (!ok) throw new HttpError(409, 'Ride is not in an acceptable state');
    const updated = await svc.getRide(id);
    notifyRide(updated);
    res.json({ ride: updated });
  } catch (err) {
    next(err);
  }
});

// POST /rides/:id/pickup — driver picks up the passenger (trip starts)
ridesRouter.post('/:id/pickup', requireAuth, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ride = await svc.getRide(id);
    if (!ride) throw new HttpError(404, 'Ride not found');
    if (ride.DRIVER_ID !== req.user!.driverId) throw new HttpError(403, 'Not your ride');
    const ok = await svc.pickup(id, req.user!.driverId!);
    if (!ok) throw new HttpError(409, 'Ride must be ACCEPTED to pick up');
    const updated = await svc.getRide(id);
    notifyRide(updated);
    res.json({ ride: updated });
  } catch (err) {
    next(err);
  }
});

// POST /rides/:id/reject — assigned driver declines; offered to the next driver
ridesRouter.post('/:id/reject', requireAuth, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const me = req.user!.driverId!;
    const ride = await svc.getRide(id);
    if (!ride) throw new HttpError(404, 'Ride not found');
    if (ride.DRIVER_ID !== me) throw new HttpError(403, 'Not your ride');
    await svc.reject(id, me);
    notifyRide(await svc.getRide(id), [me]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const completeSchema = z.object({
  // omitted -> straight-line request distance (FN_REQUEST_DISTANCE)
  distanceKm: z.coerce.number().nonnegative().optional(),
  value: z.coerce.number().nonnegative().optional(),
});

// POST /rides/:id/complete — driver ends the trip
ridesRouter.post('/:id/complete', requireAuth, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const b = parse(completeSchema, req.body);
    const ride = await svc.getRide(id);
    if (!ride) throw new HttpError(404, 'Ride not found');
    if (ride.DRIVER_ID !== req.user!.driverId) throw new HttpError(403, 'Not your ride');
    const ok = await svc.complete(id, req.user!.driverId!, b.distanceKm ?? null, b.value ?? null);
    if (!ok) throw new HttpError(409, 'Trip must be in progress to complete');
    const updated = await svc.getRide(id);
    notifyRide(updated);
    await dispatchPending(); // the driver is free again: offer waiting requests
    res.json({ ride: updated, estimate: await svc.estimate(id) });
  } catch (err) {
    next(err);
  }
});

const rateSchema = z.object({
  score: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

// POST /rides/:id/rate — client rates a completed trip
ridesRouter.post('/:id/rate', requireAuth, requireRole('CLIENT'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const b = parse(rateSchema, req.body);
    const ride = await loadAuthorized(req, id);
    if (ride.CLIENT_ID !== req.user!.clientId) throw new HttpError(403, 'Forbidden');
    try {
      await svc.rate(id, req.user!.clientId!, b.score, b.comment ?? null);
    } catch (e: any) {
      if (e?.errorNum === 1) throw new HttpError(409, 'You already rated this trip'); // uq_client_rating_trip
      throw e;
    }
    notifyRide(await svc.getRide(id));
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});
