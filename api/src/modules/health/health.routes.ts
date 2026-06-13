import { Router } from 'express';
import { withConn } from '../../db/oracle';

export const healthRouter = Router();

/** GET /health — liveness + database round-trip check. */
healthRouter.get('/', async (_req, res, next) => {
  try {
    const result = await withConn((c) =>
      c.execute<{ STATUS: string }>(`SELECT 'ok' AS status FROM dual`),
    );
    res.json({ status: 'up', db: result.rows?.[0]?.STATUS ?? 'unknown' });
  } catch (err) {
    next(err);
  }
});
