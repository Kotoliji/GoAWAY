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

export interface ClientSignup {
  name: string;
  phone?: string;
  birthDate?: Date;
  gender?: 'M' | 'F' | 'OTHER';
  paymentMethod?: 'MULTIBANCO' | 'MBWAY';
}

export interface DriverSignup {
  name: string;
  phone?: string;
  birthDate?: Date;
  licenseNumber: string;
  vehicle: {
    plate: string;
    brand?: string;
    model?: string;
    year?: number;
    fuelType: string;
    vehicleType: 'AI' | 'NOAI';
  };
}

const OUT_NUMBER = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };

/** Create CLIENT row + login in one transaction (PL/SQL app_register_client). */
export async function registerClient(
  email: string,
  passwordHash: string,
  p: ClientSignup,
): Promise<{ userId: number; clientId: number }> {
  return withConn(async (c) => {
    const r = await c.execute(
      `BEGIN app_register_client(:email, :hash, :name, :phone, :birth, :gender, :payment,
                                 :userId, :clientId); END;`,
      {
        email,
        hash: passwordHash,
        name: p.name,
        phone: p.phone ?? null,
        birth: p.birthDate ?? null,
        gender: p.gender ?? null,
        payment: p.paymentMethod ?? null,
        userId: OUT_NUMBER,
        clientId: OUT_NUMBER,
      },
      { autoCommit: true },
    );
    const o = r.outBinds as { userId: number; clientId: number };
    return { userId: o.userId, clientId: o.clientId };
  });
}

/** Create DRIVER + VEHICLE + login in one transaction (PL/SQL app_register_driver). */
export async function registerDriver(
  email: string,
  passwordHash: string,
  p: DriverSignup,
): Promise<{ userId: number; driverId: number }> {
  return withConn(async (c) => {
    const r = await c.execute(
      `BEGIN app_register_driver(:email, :hash, :name, :phone, :birth, :license,
                                 :plate, :brand, :model, :year, :fuel, :vtype,
                                 :userId, :driverId); END;`,
      {
        email,
        hash: passwordHash,
        name: p.name,
        phone: p.phone ?? null,
        birth: p.birthDate ?? null,
        license: p.licenseNumber,
        plate: p.vehicle.plate,
        brand: p.vehicle.brand ?? null,
        model: p.vehicle.model ?? null,
        year: p.vehicle.year ?? null,
        fuel: p.vehicle.fuelType,
        vtype: p.vehicle.vehicleType,
        userId: OUT_NUMBER,
        driverId: OUT_NUMBER,
      },
      { autoCommit: true },
    );
    const o = r.outBinds as { userId: number; driverId: number };
    return { userId: o.userId, driverId: o.driverId };
  });
}

/** Profile row behind a login: the CLIENT, or the DRIVER with its vehicle. */
export async function getProfile(
  clientId: number | null | undefined,
  driverId: number | null | undefined,
): Promise<Record<string, unknown> | null> {
  return withConn(async (c) => {
    if (clientId) {
      const r = await c.execute(
        `SELECT client_id, name, email, phone, birth_date, gender, payment_method,
                num_evaluations, avg_score
           FROM client WHERE client_id = :id`,
        { id: clientId },
      );
      return (r.rows?.[0] as Record<string, unknown>) ?? null;
    }
    if (driverId) {
      const r = await c.execute(
        `SELECT d.driver_id, d.name, d.email, d.phone, d.birth_date, d.license_number,
                d.status, d.avg_score, d.num_ratings,
                v.plate, v.brand, v.model, v.year, v.fuel_type, v.vehicle_type
           FROM driver d
           LEFT JOIN driver_vehicle dv ON dv.driver_id = d.driver_id
           LEFT JOIN vehicle v ON v.vehicle_id = dv.vehicle_id
          WHERE d.driver_id = :id AND ROWNUM = 1`,
        { id: driverId },
      );
      return (r.rows?.[0] as Record<string, unknown>) ?? null;
    }
    return null;
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
