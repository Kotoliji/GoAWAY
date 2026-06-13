import { Request, Response, NextFunction } from 'express';

/** An error with an explicit HTTP status code. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Maps the database's application errors (RAISE_APPLICATION_ERROR -208xx)
 * to meaningful HTTP responses. Extend this table as new endpoints are added.
 */
const ORA_TO_HTTP: Record<number, { status: number; message: string }> = {
  20801: { status: 404, message: 'Driver not found' },
  20802: { status: 404, message: 'Client not found' },
  20803: { status: 400, message: 'Invalid vehicle type' },
  20804: { status: 404, message: 'Trip not found' },
  20806: { status: 400, message: 'Invalid time interval' },
  20807: { status: 409, message: 'No available driver in range' },
  20809: { status: 400, message: 'Invalid date' },
  20810: { status: 409, message: 'No drivers available' },
  20811: { status: 400, message: 'Invalid period' },
  20812: { status: 404, message: 'Plate not found' },
  20813: { status: 404, message: 'Unknown client' },
  20814: { status: 409, message: 'Ambiguous client name' },
  20815: { status: 404, message: 'Trip request not found' },
  20816: { status: 400, message: 'Invalid amount' },
  20817: { status: 400, message: 'Invalid interval' },
  20818: { status: 409, message: 'Cannot go offline during a trip' },
  20819: { status: 403, message: 'A driver cannot rate his own trip' },
  20820: { status: 409, message: 'Trip can only be rated after completion' },
  20821: { status: 409, message: 'Request cannot be cancelled' },
  20822: { status: 409, message: 'Invalid status transition' },
};

/** Pull the ORA-208xx code out of an oracledb error, if present. */
export function mapOracleError(err: any): HttpError | undefined {
  const code: number | undefined = err?.errorNum;
  if (code && ORA_TO_HTTP[code]) {
    const m = ORA_TO_HTTP[code];
    return new HttpError(m.status, m.message);
  }
  return undefined;
}

/** Express error-handling middleware (must be registered last). */
export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const mapped = err instanceof HttpError ? err : mapOracleError(err);
  if (mapped) {
    res.status(mapped.status).json({ error: mapped.message });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
