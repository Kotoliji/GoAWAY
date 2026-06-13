import { withConn } from '../db/oracle';

/** Update a driver's current position (called from the live-location stream). */
export async function updateDriverLocation(
  driverId: number,
  lat: number,
  long: number,
): Promise<void> {
  await withConn((c) =>
    c.execute(
      `UPDATE driver SET latitude = :lat, longitude = :long WHERE driver_id = :id`,
      { lat, long, id: driverId },
      { autoCommit: true },
    ),
  );
}
