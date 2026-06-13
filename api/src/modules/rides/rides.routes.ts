import { Router, Request } from 'express';
import { z } from 'zod';
import * as svc from './rides.service';
import { requireAuth, requireRole } from '../../auth/auth.middleware';
import { HttpError } from '../../common/errors';
import { parse } from '../../common/validate';

export const ridesRouter = Router();

const createSchema = z.object({
  originAddress: z.string().max(200).optional(),
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

    const id = await svc.createRequest({
      clientId,
      originAddress: b.originAddress,
      destName: b.destName,
      destLat: b.destLat,
      destLong: b.destLong,
      vehicleType: b.vehicleType,
      fuelType: b.fuelType,
    });

    let allocated = true;
    try {
      await svc.allocate(id, b.radiusKm);
    } catch (e: any) {
      if (e?.errorNum === 20810) allocated = false; // no drivers available — keep request pending
      else throw e;
    }

    const ride = await svc.getRide(id);
    res.status(201).json({ allocated, ride });
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
    res.json({ ride: await svc.getRide(id) });
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
    res.json({ ride: await svc.getRide(id) });
  } catch (err) {
    next(err);
  }
});
