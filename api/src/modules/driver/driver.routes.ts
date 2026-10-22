import { Router } from 'express';
import { z } from 'zod';
import * as svc from './driver.service';
import * as rides from '../rides/rides.service';
import { dispatchPending } from '../rides/dispatch';
import { notifyRide } from '../../realtime/notify';
import { requireAuth, requireRole } from '../../auth/auth.middleware';
import { HttpError } from '../../common/errors';
import { parse } from '../../common/validate';

export const driverRouter = Router();
driverRouter.use(requireAuth, requireRole('DRIVER'));

function myId(req: { user?: { driverId?: number | null } }): number {
  const id = req.user?.driverId;
  if (id == null) throw new HttpError(400, 'Account is not linked to a driver');
  return id;
}

// GET /driver/state — status, today's numbers and the current ride (+ estimate)
driverRouter.get('/state', async (req, res, next) => {
  try {
    const id = myId(req);
    const driver = await svc.getDriver(id);
    if (!driver) throw new HttpError(404, 'Driver not found');
    const rideId = await rides.currentRideId(id);
    const ride = rideId != null ? await rides.getRide(rideId) : null;
    const estimate = rideId != null ? await rides.estimate(rideId) : null;
    res.json({ driver, ride, estimate });
  } catch (err) {
    next(err);
  }
});

const positionSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  long: z.coerce.number().min(-180).max(180),
});

// POST /driver/online — become AVAILABLE here; waiting requests are re-offered
driverRouter.post('/online', async (req, res, next) => {
  try {
    const id = myId(req);
    const b = parse(positionSchema, req.body);
    await svc.goOnline(id, b.lat, b.long);
    await dispatchPending();
    res.json({ driver: await svc.getDriver(id) });
  } catch (err) {
    next(err);
  }
});

// POST /driver/offline — refused mid-trip; held requests go to other drivers
driverRouter.post('/offline', async (req, res, next) => {
  try {
    const id = myId(req);
    const held = await rides.heldRequestIds(id);
    await svc.goOffline(id);
    await dispatchPending();
    for (const rideId of held) notifyRide(await rides.getRide(rideId), [id]);
    res.json({ driver: await svc.getDriver(id) });
  } catch (err) {
    next(err);
  }
});
