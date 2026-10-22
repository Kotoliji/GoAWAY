import { withConn, oracledb } from '../../db/oracle';

const LIVE = `('REQUESTED', 'ASSIGNED', 'ACCEPTED', 'PICKED_UP')`;

type Row = Record<string, unknown>;

async function rows<T = Row>(sql: string, binds: oracledb.BindParameters = {}): Promise<T[]> {
  return withConn(async (c) => (await c.execute<T>(sql, binds)).rows ?? []);
}

/** Headline numbers, monthly trips/revenue (last 24 months), requests by
 *  status and the top drivers by revenue. */
export async function overview() {
  const [kpi] = await rows(
    `SELECT
       (SELECT COUNT(*) FROM trip WHERE status = 'COMPLETED' AND end_date >= TRUNC(SYSDATE)) AS trips_today,
       (SELECT NVL(SUM(value), 0) FROM trip WHERE status = 'COMPLETED' AND end_date >= TRUNC(SYSDATE)) AS revenue_today,
       (SELECT COUNT(*) FROM trip WHERE status = 'COMPLETED' AND end_date >= SYSDATE - 30) AS trips_30d,
       (SELECT NVL(SUM(value), 0) FROM trip WHERE status = 'COMPLETED' AND end_date >= SYSDATE - 30) AS revenue_30d,
       (SELECT COUNT(*) FROM trip_request WHERE status IN ${LIVE}) AS live_rides,
       (SELECT COUNT(*) FROM driver WHERE status IN ('AVAILABLE', 'ON_TRIP')) AS drivers_online,
       (SELECT COUNT(*) FROM driver) AS drivers_total,
       (SELECT COUNT(*) FROM driver WHERE status = 'DISABLED') AS drivers_disabled,
       (SELECT COUNT(*) FROM client) AS clients,
       (SELECT ROUND(AVG(avg_score), 2) FROM driver WHERE num_ratings > 0) AS avg_rating,
       (SELECT ROUND(100 * SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1)
          FROM trip_request) AS cancel_pct
     FROM dual`,
  );
  const monthly = await rows<{ MONTH: string; TRIPS: number; REVENUE: number }>(
    `SELECT TO_CHAR(TRUNC(end_date, 'MM'), 'YYYY-MM') AS month, COUNT(*) AS trips,
            ROUND(SUM(value), 2) AS revenue
       FROM trip
      WHERE status = 'COMPLETED' AND end_date >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -23)
      GROUP BY TRUNC(end_date, 'MM')`,
  );
  const byStatus = await rows(
    `SELECT status, COUNT(*) AS n FROM trip_request GROUP BY status ORDER BY n DESC`,
  );
  const topDrivers = await rows(
    `SELECT d.driver_id, d.name, d.avg_score, COUNT(*) AS trips, ROUND(SUM(t.value), 2) AS revenue
       FROM trip t JOIN driver d ON d.driver_id = t.driver_id
      WHERE t.status = 'COMPLETED'
      GROUP BY d.driver_id, d.name, d.avg_score
      ORDER BY revenue DESC
      FETCH FIRST 5 ROWS ONLY`,
  );

  // every one of the last 24 months, zero-filled
  const byMonth = new Map(monthly.map((m) => [m.MONTH, m]));
  const series = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    series.push({ month: key, trips: byMonth.get(key)?.TRIPS ?? 0, revenue: byMonth.get(key)?.REVENUE ?? 0 });
  }
  return { kpi, monthly: series, byStatus, topDrivers };
}

/** Everything moving right now: live requests and online drivers. */
export async function live() {
  const rides = await rows(
    `SELECT tr.request_id, tr.status, tr.request_date, tr.driver_id,
            c.name AS client_name, c.latitude AS pickup_lat, c.longitude AS pickup_long,
            tr.dest_name, tr.dest_lat, tr.dest_long, d.name AS driver_name
       FROM trip_request tr
       JOIN client c ON c.client_id = tr.client_id
       LEFT JOIN driver d ON d.driver_id = tr.driver_id
      WHERE tr.status IN ${LIVE}
      ORDER BY tr.request_date DESC`,
  );
  const drivers = await rows(
    `SELECT driver_id, name, status, latitude, longitude, avg_score
       FROM driver
      WHERE status IN ('AVAILABLE', 'ON_TRIP') AND latitude IS NOT NULL`,
  );
  return { rides, drivers };
}

/** Latest 200 requests, optionally of one status. */
export async function listRides(status?: string) {
  return rows(
    `SELECT tr.request_id, tr.status, tr.request_date, tr.origin_address, tr.dest_name,
            tr.vehicle_type, c.name AS client_name, d.name AS driver_name,
            t.distance_km, t.value AS fare,
            CASE WHEN tr.status = 'CANCELLED' THEN tr.proposed_value END AS cancel_fee
       FROM trip_request tr
       JOIN client c ON c.client_id = tr.client_id
       LEFT JOIN trip t ON t.request_id = tr.request_id
       LEFT JOIN driver d ON d.driver_id = NVL(t.driver_id, tr.driver_id)
      WHERE (:status IS NULL OR tr.status = :status)
      ORDER BY tr.request_date DESC, tr.request_id DESC
      FETCH FIRST 200 ROWS ONLY`,
    { status: status ?? null },
  );
}

/** All drivers with vehicle, lifetime numbers and the amount not paid out yet
 *  (completed trips after their last payment, as paga_aos_motoristas sees it). */
export async function listDrivers() {
  return rows(
    `SELECT d.driver_id, d.name, d.email, d.phone, d.status, d.avg_score, d.num_ratings,
            d.registration_date,
            (SELECT MIN(NVL2(TRIM(v.brand || ' ' || v.model), TRIM(v.brand || ' ' || v.model) || ' · ', '') || v.plate)
               FROM driver_vehicle dv JOIN vehicle v ON v.vehicle_id = dv.vehicle_id
              WHERE dv.driver_id = d.driver_id) AS vehicle,
            (SELECT MIN(v.vehicle_type) FROM driver_vehicle dv JOIN vehicle v ON v.vehicle_id = dv.vehicle_id
              WHERE dv.driver_id = d.driver_id) AS vehicle_type,
            s.trips, s.revenue, s.last_trip,
            (SELECT NVL(SUM(t.value), 0) FROM trip t
              WHERE t.driver_id = d.driver_id AND t.status = 'COMPLETED'
                AND t.end_date > NVL((SELECT MAX(p.period_end) FROM driver_payment p
                                       WHERE p.driver_id = d.driver_id), DATE '1900-01-01')) AS unpaid
       FROM driver d
       LEFT JOIN (SELECT driver_id, COUNT(*) AS trips, ROUND(SUM(value), 2) AS revenue,
                         MAX(end_date) AS last_trip
                    FROM trip WHERE status = 'COMPLETED' GROUP BY driver_id) s
         ON s.driver_id = d.driver_id
      ORDER BY NVL(s.revenue, 0) DESC, d.driver_id`,
  );
}

/** Disable / re-enable one driver (PL/SQL app_admin_set_driver_status). */
export async function setDriverStatus(driverId: number, status: 'DISABLED' | 'OFFLINE'): Promise<void> {
  await withConn((c) =>
    c.execute(`BEGIN app_admin_set_driver_status(:id, :status); END;`, { id: driverId, status }, { autoCommit: true }),
  );
}

/** Run cancela_motoristas and report who it disabled. */
export async function deactivateLowRated(vehicleType: 'AI' | 'NOAI', from: Date, to: Date) {
  return withConn(async (c) => {
    const before = await c.execute<{ DRIVER_ID: number }>(`SELECT driver_id FROM driver WHERE status = 'DISABLED'`);
    const was = new Set((before.rows ?? []).map((r) => r.DRIVER_ID));
    await c.execute(`BEGIN cancela_motoristas(:vt, :d1, :d2); END;`, { vt: vehicleType, d1: from, d2: to });
    await c.commit();
    const after = await c.execute<{ DRIVER_ID: number; NAME: string }>(
      `SELECT driver_id, name FROM driver WHERE status = 'DISABLED'`,
    );
    return (after.rows ?? []).filter((r) => !was.has(r.DRIVER_ID));
  });
}

/** Latest 200 payouts. */
export async function listPayments() {
  return rows(
    `SELECT p.payment_id, p.driver_id, d.name, p.period_start, p.period_end,
            p.value, p.commission, p.net_value, p.payment_date
       FROM driver_payment p JOIN driver d ON d.driver_id = p.driver_id
      ORDER BY p.payment_id DESC
      FETCH FIRST 200 ROWS ONLY`,
  );
}

/** Run paga_aos_motoristas and return the payments it registered. */
export async function runPayouts(minAmount: number, minDays: number) {
  return withConn(async (c) => {
    const r = await c.execute<{ MAXID: number | null }>(`SELECT MAX(payment_id) AS maxid FROM driver_payment`);
    const before = r.rows?.[0]?.MAXID ?? 0;
    await c.execute(`BEGIN paga_aos_motoristas(:amt, :days); END;`, { amt: minAmount, days: minDays });
    await c.commit();
    const created = await c.execute(
      `SELECT p.payment_id, p.driver_id, d.name, p.period_start, p.period_end,
              p.value, p.commission, p.net_value, p.payment_date
         FROM driver_payment p JOIN driver d ON d.driver_id = p.driver_id
        WHERE p.payment_id > :before
        ORDER BY p.payment_id`,
      { before },
    );
    return created.rows ?? [];
  });
}

/** The analytical views from database/03_views, by key. Only these names are
 *  ever interpolated into SQL. */
export const REPORTS: Record<string, { view: string; title: string; description: string }> = {
  'unrealised-requests': {
    view: 'view_a', title: 'Requests without a trip (Coimbra)',
    description: 'Clients whose trip requests did not turn into trips, with their previous trip and total trips.',
  },
  'weekday-activity': {
    view: 'view_b', title: 'Activity by weekday (last month)',
    description: 'Trips, total trip time and driver availability per day of the week.',
  },
  'top-earning-drivers': {
    view: 'view_c', title: 'Drivers above their class average',
    description: 'Trips and revenue this month and since registration, for drivers out-earning their vehicle type.',
  },
  'cancellation-fees-by-age': {
    view: 'view_d', title: 'Cancellation fees by age group',
    description: 'Count and value of cancellation fees per client age decade, with month-on-month change.',
  },
  'busiest-driver-trips': {
    view: 'view_e', title: "Busiest driver's trips this year",
    description: 'Chronological trips of the driver with most trips, for clients rated above 4.3.',
  },
  'rating-mode': {
    view: 'view_f', title: 'Most frequent rating per driver (last month)',
    description: 'Mode of the ratings each driver received; drivers with 20+ trips.',
  },
  'electric-near-isec': {
    view: 'view_g', title: 'Electric drivers near ISEC',
    description: 'Available electric drivers within 30 km of ISEC, by proximity.',
  },
  'monthly-by-model': {
    view: 'view_h', title: 'Monthly trips by vehicle model (2024-2025)',
    description: 'Average monthly trips per vehicle category and model for above-average drivers.',
  },
  'rating-distribution': {
    view: 'view_i', title: 'Rating distribution, long trips',
    description: 'Top 5 drivers by share of each star rating, trips over 50 km last month.',
  },
  'smart-vehicle-efficiency': {
    view: 'view_e1_', title: 'Smart vehicle efficiency',
    description: 'Per smart model: completed trips, average fare, distance and duration.',
  },
  'below-average-drivers': {
    view: 'view_e2_', title: 'Drivers rated below average',
    description: 'Drivers whose average client rating is below the platform average.',
  },
  'smart-model-preferences': {
    view: 'view_k1_', title: 'Smart model preferences',
    description: 'Times each smart brand/model was chosen with an extra fee, fees charged and rating.',
  },
  'regional-pricing': {
    view: 'view_k2_', title: 'Price per km by region',
    description: 'Average price per km per departure region vs the platform average (surge indicator).',
  },
};

export async function report(key: string) {
  const r = REPORTS[key];
  if (!r) return null;
  return withConn(async (c) => {
    const res = await c.execute(`SELECT * FROM ${r.view} FETCH FIRST 500 ROWS ONLY`);
    return {
      ...r,
      columns: (res.metaData ?? []).map((m) => m.name),
      rows: res.rows ?? [],
    };
  });
}
