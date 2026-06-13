import { withConn, oracledb } from '../db/oracle';
import { Role } from './jwt';

export interface AppUser {
  USER_ID: number;
  EMAIL: string;
  PASSWORD_HASH: string;
  ROLE: Role;
  STATUS: string;
  CLIENT_ID: number | null;
  DRIVER_ID: number | null;
}

/** Insert a new app_user; returns the generated user_id. */
export async function createUser(params: {
  email: string;
  passwordHash: string;
  role: Role;
  clientId?: number | null;
  driverId?: number | null;
}): Promise<number> {
  return withConn(async (c) => {
    const r = await c.execute(
      `INSERT INTO app_user (user_id, email, password_hash, role, client_id, driver_id)
       VALUES (seq_app_user.NEXTVAL, :email, :hash, :role, :clientId, :driverId)
       RETURNING user_id INTO :id`,
      {
        email: params.email,
        hash: params.passwordHash,
        role: params.role,
        clientId: params.clientId ?? null,
        driverId: params.driverId ?? null,
        id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
      },
      { autoCommit: true },
    );
    const outBinds = r.outBinds as { id: number[] };
    return outBinds.id[0];
  });
}

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  return withConn(async (c) => {
    const r = await c.execute<AppUser>(
      `SELECT user_id, email, password_hash, role, status, client_id, driver_id
         FROM app_user WHERE email = :email`,
      { email },
    );
    return r.rows?.[0] ?? null;
  });
}

export async function findUserById(userId: number): Promise<AppUser | null> {
  return withConn(async (c) => {
    const r = await c.execute<AppUser>(
      `SELECT user_id, email, password_hash, role, status, client_id, driver_id
         FROM app_user WHERE user_id = :id`,
      { id: userId },
    );
    return r.rows?.[0] ?? null;
  });
}

export async function storeRefresh(
  userId: number,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await withConn((c) =>
    c.execute(
      `INSERT INTO refresh_token (token_id, user_id, token_hash, expires_at)
       VALUES (seq_refresh_token.NEXTVAL, :userId, :hash, :exp)`,
      { userId, hash: tokenHash, exp: expiresAt },
      { autoCommit: true },
    ),
  );
}

export interface RefreshRow {
  TOKEN_ID: number;
  USER_ID: number;
  EXPIRES_AT: Date;
  REVOKED: number;
}

export async function findValidRefresh(tokenHash: string): Promise<RefreshRow | null> {
  return withConn(async (c) => {
    const r = await c.execute<RefreshRow>(
      `SELECT token_id, user_id, expires_at, revoked
         FROM refresh_token
        WHERE token_hash = :hash AND revoked = 0 AND expires_at > SYSDATE`,
      { hash: tokenHash },
    );
    return r.rows?.[0] ?? null;
  });
}

export async function revokeRefresh(tokenHash: string): Promise<void> {
  await withConn((c) =>
    c.execute(
      `UPDATE refresh_token SET revoked = 1 WHERE token_hash = :hash`,
      { hash: tokenHash },
      { autoCommit: true },
    ),
  );
}
