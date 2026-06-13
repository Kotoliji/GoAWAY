import oracledb from 'oracledb';
import { env } from '../config/env';

// Return query rows as plain objects ({ COL: value }) instead of arrays.
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
// Read CLOBs straight into JS strings.
oracledb.fetchAsString = [oracledb.CLOB];

let pool: oracledb.Pool | undefined;

/** Create the shared connection pool. node-oracledb 6 runs in pure-JS "thin"
 *  mode by default, so no Oracle Instant Client is required. */
export async function initDb(): Promise<void> {
  pool = await oracledb.createPool({
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    connectString: env.DB_CONNECT_STRING,
    poolMin: 1,
    poolMax: 10,
    poolIncrement: 1,
  });
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.close(2);
    pool = undefined;
  }
}

/** Borrow a connection, run `fn`, and always return the connection to the pool. */
export async function withConn<T>(
  fn: (conn: oracledb.Connection) => Promise<T>,
): Promise<T> {
  if (!pool) throw new Error('DB pool not initialised — call initDb() first');
  const conn = await pool.getConnection();
  try {
    return await fn(conn);
  } finally {
    await conn.close();
  }
}

export { oracledb };
