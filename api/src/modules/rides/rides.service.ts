import { withConn, oracledb } from '../../db/oracle';

export interface RideRow {
  REQUEST_ID: number;
  CLIENT_ID: number;
  STATUS: string;
  VEHICLE_TYPE: string | null;
  ORIGIN_ADDRESS: string | null;
  DEST_NAME: string | null;
  DEST_LAT: number | null;
  DEST_LONG: number | null;
  PROPOSED_VALUE: number | null;
  REQUEST_DATE: Date;
  DRIVER_ID: number | null;
  DRIVER_NAME: string | null;
  DRIVER_LAT: number | null;
  DRIVER_LONG: number | null;
  DRIVER_RATING: number | null;
  CLIENT_NAME: string | null;
  CLIENT_LAT: number | null;
  CLIENT_LONG: number | null;
  VEHICLE_PLATE: string | null;
  VEHICLE_DESC: string | null;
}

export interface NewRide {
  clientId: number;
  originAddress?: string;
  destName?: string;
  destLat?: number;
  destLong?: number;
  vehicleType: 'AI' | 'NOAI';
  fuelType?: string;
}

// Tariff for a request: its requested fuel type, else the assigned vehicle's.
const TARIFF_COLS = `
  (SELECT base_fee     FROM tariff t WHERE t.fuel_type = NVL(tr.fuel_type, v.fuel_type) AND ROWNUM = 1) AS base_fee,
  (SELECT price_per_km FROM tariff t WHERE t.fuel_type = NVL(tr.fuel_type, v.fuel_type) AND ROWNUM = 1) AS price_per_km`;

function fareFor(km: number, base: number | null, perKm: number | null): number {
  return Math.round(((base ?? 2.5) + (perKm ?? 0.5) * km) * 100) / 100;
}

/** Store the client's current position: aloca_motorista and FN_REQUEST_DISTANCE
 *  use it as the pickup point. */
export async function setClientLocation(clientId: number, lat: number, long: number): Promise<void> {
  await withConn((c) =>
    c.execute(
      `UPDATE client SET latitude = :lat, longitude = :lng WHERE client_id = :id`,
      { lat, lng: long, id: clientId },
      { autoCommit: true },
    ),
  );
}

/** Insert a new trip_request (status REQUESTED). Returns the new request_id. */
export async function createRequest(r: NewRide): Promise<number> {
  return withConn(async (c) => {
    const result = await c.execute(
      `INSERT INTO trip_request
         (request_id, client_id, origin_address, dest_name, dest_lat, dest_long,
          request_date, status, vehicle_type, fuel_type)
       VALUES
         (seq_trip_request.NEXTVAL, :clientId, :origin, :destName, :destLat, :destLong,
          SYSDATE, 'REQUESTED', :vehicleType, :fuelType)
       RETURNING request_id INTO :id`,
      {
        clientId: r.clientId,
        origin: r.originAddress ?? null,
        destName: r.destName ?? null,
        destLat: r.destLat ?? null,
        destLong: r.destLong ?? null,
        vehicleType: r.vehicleType,
        fuelType: r.fuelType ?? null,
        id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
      },
      { autoCommit: true },
    );
    return (result.outBinds as { id: number[] }).id[0];
  });
}

/** Try to assign the nearest suitable driver (PL/SQL aloca_motorista). */
export async function allocate(requestId: number, radiusKm: number): Promise<void> {
  await withConn((c) =>
    c.execute(
      `BEGIN aloca_motorista(:req, :raio); END;`,
      { req: requestId, raio: radiusKm },
      { autoCommit: true },
    ),
  );
}

export async function getRide(requestId: number): Promise<RideRow | null> {
  return withConn(async (c) => {
    const r = await c.execute<RideRow>(
      `SELECT tr.request_id, tr.client_id, tr.status, tr.vehicle_type,
              tr.origin_address, tr.dest_name, tr.dest_lat, tr.dest_long,
              tr.proposed_value, tr.request_date,
              tr.driver_id,
              d.name      AS driver_name,
              d.latitude  AS driver_lat,
              d.longitude AS driver_long,
              d.avg_score AS driver_rating,
              c.name      AS client_name,
              c.latitude  AS client_lat,
              c.longitude AS client_long,
              v.plate     AS vehicle_plate,
              TRIM(v.brand || ' ' || v.model) AS vehicle_desc
         FROM trip_request tr
         JOIN client c ON c.client_id = tr.client_id
         LEFT JOIN driver d ON d.driver_id = tr.driver_id
         LEFT JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
        WHERE tr.request_id = :id`,
      { id: requestId },
    );
    return r.rows?.[0] ?? null;
  });
}

/** Cancel a request (PL/SQL SP_CANCEL_REQUEST: sets CANCELLED + fee). */
export async function cancel(requestId: number): Promise<void> {
  await withConn((c) =>
    c.execute(
      `BEGIN SP_CANCEL_REQUEST(:req); END;`,
      { req: requestId },
      { autoCommit: true },
    ),
  );
}

/** Driver accepts an assigned request: ASSIGNED -> ACCEPTED. */
export async function accept(requestId: number, driverId: number): Promise<boolean> {
  return withConn(async (c) => {
    const r = await c.execute(
      `UPDATE trip_request SET status = 'ACCEPTED'
        WHERE request_id = :id AND driver_id = :drv AND status = 'ASSIGNED'`,
      { id: requestId, drv: driverId },
      { autoCommit: true },
    );
    return (r.rowsAffected ?? 0) > 0;
  });
}

export interface Estimate {
  km: number | null;
  fare: number | null;
}

/** Estimated distance (FN_REQUEST_DISTANCE) and a simple fare from the tariff. */
export async function estimate(requestId: number): Promise<Estimate | null> {
  return withConn(async (c) => {
    const r = await c.execute<{
      KM: number | null;
      BASE_FEE: number | null;
      PRICE_PER_KM: number | null;
    }>(
      `SELECT FN_REQUEST_DISTANCE(:id) AS km, ${TARIFF_COLS}
         FROM trip_request tr
         LEFT JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
        WHERE tr.request_id = :id`,
      { id: requestId },
    );
    const row = r.rows?.[0];
    if (!row) return null;
    const km = row.KM != null ? Math.round(row.KM * 100) / 100 : null;
    const fare = km != null ? fareFor(km, row.BASE_FEE, row.PRICE_PER_KM) : null;
    return { km, fare };
  });
}

/** Driver picks up the passenger: ACCEPTED -> PICKED_UP, and the trip starts
 *  (creates the TRIP row, driver goes ON_TRIP). */
export async function pickup(requestId: number, driverId: number): Promise<boolean> {
  return withConn(async (c) => {
    const up = await c.execute(
      `UPDATE trip_request SET status = 'PICKED_UP', pickup_date = SYSDATE
        WHERE request_id = :id AND driver_id = :drv AND status = 'ACCEPTED'`,
      { id: requestId, drv: driverId },
    );
    if ((up.rowsAffected ?? 0) === 0) {
      await c.rollback();
      return false;
    }
    const v = await c.execute<{ VEHICLE_ID: number | null }>(
      `SELECT vehicle_id FROM trip_request WHERE request_id = :id`,
      { id: requestId },
    );
    const vehicleId = v.rows?.[0]?.VEHICLE_ID ?? null;
    await c.execute(
      `INSERT INTO trip (request_id, driver_id, vehicle_id, start_date, pickup_date,
                         pickup_lat, pickup_long, status)
       SELECT :id, :drv, :veh, SYSDATE, SYSDATE, latitude, longitude, 'IN_PROGRESS'
         FROM driver WHERE driver_id = :drv`,
      { id: requestId, drv: driverId, veh: vehicleId },
    );
    await c.execute(`UPDATE driver SET status = 'ON_TRIP' WHERE driver_id = :drv`, {
      drv: driverId,
    });
    await c.commit();
    return true;
  });
}

/** Driver ends the trip: marks the TRIP COMPLETED (fires viagem_Terminada, which
 *  frees the driver and updates shift totals) and the request COMPLETED.
 *  Distance defaults to FN_REQUEST_DISTANCE; the fare to distance x tariff. */
export async function complete(
  requestId: number,
  driverId: number,
  distanceKm: number | null,
  value: number | null,
): Promise<boolean> {
  return withConn(async (c) => {
    const t = await c.execute<{ KM: number | null; BASE_FEE: number | null; PRICE_PER_KM: number | null }>(
      `SELECT FN_REQUEST_DISTANCE(:id) AS km, ${TARIFF_COLS}
         FROM trip_request tr
         LEFT JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
        WHERE tr.request_id = :id`,
      { id: requestId },
    );
    const row = t.rows?.[0];
    const dist = Math.round((distanceKm ?? row?.KM ?? 0) * 100) / 100;
    const fare = value ?? fareFor(dist, row?.BASE_FEE ?? null, row?.PRICE_PER_KM ?? null);
    const up = await c.execute(
      `UPDATE trip
          SET end_date = SYSDATE, distance_km = :dist, value = :val, status = 'COMPLETED'
        WHERE request_id = :id AND driver_id = :drv AND status = 'IN_PROGRESS'`,
      { dist, val: fare, id: requestId, drv: driverId },
    );
    if ((up.rowsAffected ?? 0) === 0) {
      await c.rollback();
      return false;
    }
    await c.execute(`UPDATE trip_request SET status = 'COMPLETED' WHERE request_id = :id`, {
      id: requestId,
    });
    await c.commit();
    return true;
  });
}

/** Client rates a completed trip. cliente_Avalia validates (only completed,
 *  no self-rating) and TRG_DRIVER_RATING_UPDATE refreshes the driver score. */
export async function rate(
  requestId: number,
  clientId: number,
  score: number,
  comment: string | null,
): Promise<void> {
  await withConn((c) =>
    c.execute(
      `INSERT INTO client_rating (client_rating_id, trip_id, client_id, score, review_comment, rating_date)
       VALUES (seq_client_rating.NEXTVAL, :trip, :client, :score, :cmt, SYSDATE)`,
      { trip: requestId, client: clientId, score, cmt: comment ?? null },
      { autoCommit: true },
    ),
  );
}

/** Assigned driver declines (PL/SQL app_driver_reject: logs REJECTED and
 *  immediately offers the request to the next suitable driver). */
export async function reject(requestId: number, driverId: number, radiusKm = 50): Promise<void> {
  await withConn((c) =>
    c.execute(
      `BEGIN app_driver_reject(:req, :drv, :radius); END;`,
      { req: requestId, drv: driverId, radius: radiusKm },
      { autoCommit: true },
    ),
  );
}

/** Recent requests still waiting for a driver (oldest first). */
export async function pendingRequestIds(maxAgeMin = 30): Promise<number[]> {
  return withConn(async (c) => {
    const r = await c.execute<{ REQUEST_ID: number }>(
      `SELECT request_id FROM trip_request
        WHERE status = 'REQUESTED' AND driver_id IS NULL
          AND request_date > SYSDATE - :age / 1440
        ORDER BY request_date`,
      { age: maxAgeMin },
    );
    return (r.rows ?? []).map((x) => x.REQUEST_ID);
  });
}

/** Requests a driver holds but has not started (released if they go offline). */
export async function heldRequestIds(driverId: number): Promise<number[]> {
  return withConn(async (c) => {
    const r = await c.execute<{ REQUEST_ID: number }>(
      `SELECT request_id FROM trip_request
        WHERE driver_id = :drv AND status IN ('ASSIGNED', 'ACCEPTED')`,
      { drv: driverId },
    );
    return (r.rows ?? []).map((x) => x.REQUEST_ID);
  });
}

/** The driver's current live request, if any. */
export async function currentRideId(driverId: number): Promise<number | null> {
  return withConn(async (c) => {
    const r = await c.execute<{ REQUEST_ID: number }>(
      `SELECT request_id FROM (
         SELECT request_id FROM trip_request
          WHERE driver_id = :drv AND status IN ('ASSIGNED', 'ACCEPTED', 'PICKED_UP')
          ORDER BY request_date DESC)
        WHERE ROWNUM = 1`,
      { drv: driverId },
    );
    return r.rows?.[0]?.REQUEST_ID ?? null;
  });
}
