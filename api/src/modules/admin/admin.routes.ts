import { Router } from 'express';
import { z } from 'zod';
import * as svc from './admin.service';
import * as rides from '../rides/rides.service';
import { dispatchPending } from '../rides/dispatch';
import { notifyRide } from '../../realtime/notify';
import { requireAuth, requireRole } from '../../auth/auth.middleware';
import { HttpError } from '../../common/errors';
import { parse } from '../../common/validate';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

/** Wrap an async handler so errors reach the central error handler. */
const h = (fn: (req: any, res: any) => Promise<unknown>) => (req: any, res: any, next: any) =>
  fn(req, res).catch(next);

// GET /admin/overview — KPIs, monthly series, requests by status, top drivers
adminRouter.get('/overview', h(async (_req, res) => res.json(await svc.overview())));

// GET /admin/live — live requests + online drivers (the live map)
adminRouter.get('/live', h(async (_req, res) => res.json(await svc.live())));

const STATUSES = ['REQUESTED', 'ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'COMPLETED', 'CANCELLED'] as const;

// GET /admin/rides?status= — latest 200 requests
adminRouter.get('/rides', h(async (req, res) => {
  const q = parse(z.object({ status: z.enum(STATUSES).optional() }), req.query);
  res.json({ rides: await svc.listRides(q.status) });
}));

// GET /admin/drivers — all drivers with lifetime numbers and unpaid amount
adminRouter.get('/drivers', h(async (_req, res) => res.json({ drivers: await svc.listDrivers() })));

// POST /admin/drivers/:id/status { status: DISABLED | OFFLINE } — disable / re-enable
adminRouter.post('/drivers/:id/status', h(async (req, res) => {
  const id = Number(req.params.id);
  const b = parse(z.object({ status: z.enum(['DISABLED', 'OFFLINE']) }), req.body);
  const held = await rides.heldRequestIds(id);
  await svc.setDriverStatus(id, b.status);
  if (held.length) {
    // requests the driver held went back to the queue: offer them again
    await dispatchPending();
    for (const rideId of held) notifyRide(await rides.getRide(rideId), [id]);
  }
  res.json({ ok: true });
}));

const periodSchema = z.object({
  vehicleType: z.enum(['AI', 'NOAI']),
  from: z.coerce.date(),
  to: z.coerce.date(),
});

// POST /admin/drivers/deactivate-low-rated — cancela_motoristas over a period
adminRouter.post('/drivers/deactivate-low-rated', h(async (req, res) => {
  const b = parse(periodSchema, req.body);
  if (b.to < b.from) throw new HttpError(400, '`to` must be after `from`');
  res.json({ disabled: await svc.deactivateLowRated(b.vehicleType, b.from, b.to) });
}));

// GET /admin/payments — latest payouts
adminRouter.get('/payments', h(async (_req, res) => res.json({ payments: await svc.listPayments() })));

// POST /admin/payments/run { minAmount, minDays } — paga_aos_motoristas
adminRouter.post('/payments/run', h(async (req, res) => {
  const b = parse(
    z.object({ minAmount: z.coerce.number().nonnegative(), minDays: z.coerce.number().int().nonnegative() }),
    req.body,
  );
  res.json({ created: await svc.runPayouts(b.minAmount, b.minDays) });
}));

// GET /admin/reports — the analytical views; GET /admin/reports/:key — one of them
adminRouter.get('/reports', (_req, res) => {
  res.json({
    reports: Object.entries(svc.REPORTS).map(([key, r]) => ({ key, title: r.title, description: r.description })),
  });
});

adminRouter.get('/reports/:key', h(async (req, res) => {
  const r = await svc.report(req.params.key);
  if (!r) throw new HttpError(404, 'Unknown report');
  res.json(r);
}));
