import { withConn } from '../../db/oracle';

export interface DriverRow {
  DRIVER_ID: number;
  NAME: string;
  STATUS: string;
  LATITUDE: number | null;
  LONGITUDE: number | null;
  AVG_SCORE: number | null;
  VEHICLE_PLATE: string | null;
  VEHICLE_DESC: string | null;
  TRIPS_TODAY: number;
  EARNED_TODAY: number;
}

/** Driver status, position, vehicle and today's completed trips / earnings. */
export async function getDriver(driverId: number): Promise<DriverRow | null> {
  return withConn(async (c) => {
    const r = await c.execute<DriverRow>(
      `SELECT d.driver_id, d.name, d.status, d.latitude, d.longitude, d.avg_score,
              (SELECT MIN(v.plate) FROM driver_vehicle dv JOIN vehicle v ON v.vehicle_id = dv.vehicle_id
                WHERE dv.driver_id = d.driver_id) AS vehicle_plate,
              (SELECT MIN(TRIM(v.brand || ' ' || v.model)) FROM driver_vehicle dv
                 JOIN vehicle v ON v.vehicle_id = dv.vehicle_id
                WHERE dv.driver_id = d.driver_id) AS vehicle_desc,
              (SELECT COUNT(*) FROM trip t WHERE t.driver_id = d.driver_id
                  AND t.status = 'COMPLETED' AND t.end_date >= TRUNC(SYSDATE)) AS trips_today,
              (SELECT NVL(SUM(t.value), 0) FROM trip t WHERE t.driver_id = d.driver_id
                  AND t.status = 'COMPLETED' AND t.end_date >= TRUNC(SYSDATE)) AS earned_today
         FROM driver d
        WHERE d.driver_id = :id`,
      { id: driverId },
    );
    return r.rows?.[0] ?? null;
  });
}

/** Go online at a position (PL/SQL app_driver_go_online; -20823 if disabled). */
export async function goOnline(driverId: number, lat: number, long: number): Promise<void> {
  await withConn((c) =>
    c.execute(
      `BEGIN app_driver_go_online(:id, :lat, :lng); END;`,
      { id: driverId, lat, lng: long },
      { autoCommit: true },
    ),
  );
}

/** Go offline. The update_status trigger refuses it mid-trip (-20818) and
 *  hands any ASSIGNED / ACCEPTED request back to the queue. */
export async function goOffline(driverId: number): Promise<void> {
  await withConn((c) =>
    c.execute(
      `UPDATE driver SET status = 'OFFLINE' WHERE driver_id = :id AND status <> 'DISABLED'`,
      { id: driverId },
      { autoCommit: true },
    ),
  );
}
