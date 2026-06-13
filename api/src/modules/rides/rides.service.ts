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
              d.avg_score AS driver_rating
         FROM trip_request tr
         LEFT JOIN driver d ON d.driver_id = tr.driver_id
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
      `SELECT FN_REQUEST_DISTANCE(:id) AS km,
              (SELECT base_fee     FROM tariff WHERE fuel_type = tr.fuel_type AND ROWNUM = 1) AS base_fee,
              (SELECT price_per_km FROM tariff WHERE fuel_type = tr.fuel_type AND ROWNUM = 1) AS price_per_km
         FROM trip_request tr
        WHERE tr.request_id = :id`,
      { id: requestId },
    );
    const row = r.rows?.[0];
    if (!row) return null;
    const km = row.KM;
    const base = row.BASE_FEE ?? 2.5;
    const perKm = row.PRICE_PER_KM ?? 0.5;
    const fare = km != null ? Math.round((base + perKm * km) * 100) / 100 : null;
    return { km, fare };
  });
}

/** Driver picks up the passenger: ACCEPTED -> PICKED_UP, and the trip starts
 *  (creates the TRIP row, driver goes ON_TRIP). */
export async function pickup(requestId: number, driverId: number): Promise<boolean> {
  return withConn(async (c) => {
    const up = await c.execute(
      `UPDATE trip_request SET status = 'PICKED_UP'
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
      `INSERT INTO trip (request_id, driver_id, vehicle_id, start_date, pickup_date, status)
       VALUES (:id, :drv, :veh, SYSDATE, SYSDATE, 'IN_PROGRESS')`,
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
 *  If no fare is supplied it is computed from distance and the tariff. */
export async function complete(
  requestId: number,
  driverId: number,
  distanceKm: number,
  value: number | null,
): Promise<boolean> {
  return withConn(async (c) => {
    let fare = value;
    if (fare == null) {
      const t = await c.execute<{ BASE: number | null; PERKM: number | null }>(
        `SELECT (SELECT base_fee     FROM tariff WHERE fuel_type = tr.fuel_type AND ROWNUM = 1) AS base,
                (SELECT price_per_km FROM tariff WHERE fuel_type = tr.fuel_type AND ROWNUM = 1) AS perkm
           FROM trip_request tr WHERE request_id = :id`,
        { id: requestId },
      );
      const base = t.rows?.[0]?.BASE ?? 2.5;
      const perKm = t.rows?.[0]?.PERKM ?? 0.5;
      fare = Math.round((base + perKm * distanceKm) * 100) / 100;
    }
    const up = await c.execute(
      `UPDATE trip
          SET end_date = SYSDATE, distance_km = :dist, value = :val, status = 'COMPLETED'
        WHERE request_id = :id AND driver_id = :drv AND status = 'IN_PROGRESS'`,
      { dist: distanceKm, val: fare, id: requestId, drv: driverId },
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
