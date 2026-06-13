import { Router } from 'express';
import { z } from 'zod';
import { withConn, oracledb } from '../../db/oracle';
import { HttpError } from '../../common/errors';

export const geoRouter = Router();

const coordsSchema = z.object({
  lat1: z.coerce.number(),
  long1: z.coerce.number(),
  lat2: z.coerce.number(),
  long2: z.coerce.number(),
});

/**
 * GET /api/geo/distance?lat1&long1&lat2&long2
 * Bridges straight to the database function distancia_linear (Haversine).
 */
geoRouter.get('/distance', async (req, res, next) => {
  try {
    const parsed = coordsSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new HttpError(400, 'lat1, long1, lat2, long2 are required numbers');
    }
    const { lat1, long1, lat2, long2 } = parsed.data;

    const result = await withConn((c) =>
      c.execute<{ KM: number }>(
        `SELECT distancia_linear(:a, :b, :c, :d) AS km FROM dual`,
        { a: lat1, b: long1, c: lat2, d: long2 },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      ),
    );

    res.json({ km: result.rows?.[0]?.KM ?? null });
  } catch (err) {
    next(err);
  }
});
