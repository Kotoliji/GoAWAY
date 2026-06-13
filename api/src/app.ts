import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { healthRouter } from './modules/health/health.routes';
import { geoRouter } from './modules/geo/geo.routes';
import { errorHandler } from './common/errors';

/** Build the Express application (no network side-effects). */
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use('/health', healthRouter);
  app.use('/api/geo', geoRouter);

  // 404 fallback
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // central error handler (last)
  app.use(errorHandler);

  return app;
}
