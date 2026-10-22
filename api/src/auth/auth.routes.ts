import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import * as svc from './auth.service';
import { Role, signAccess, newRefreshToken, hashToken, refreshExpiry } from './jwt';
import { HttpError } from '../common/errors';
import { parse } from '../common/validate';

export const authRouter = Router();

// Public sign-up creates the CLIENT / DRIVER row together with the login.
// ADMIN accounts are not self-service (seeded by database/05_app/04_demo_users.sql).
const personFields = {
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(20).optional(),
  birthDate: z.coerce.date().optional(),
};

const registerSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('CLIENT'),
    ...personFields,
    gender: z.enum(['M', 'F', 'OTHER']).optional(),
    paymentMethod: z.enum(['MULTIBANCO', 'MBWAY']).optional(),
  }),
  z.object({
    role: z.literal('DRIVER'),
    ...personFields,
    licenseNumber: z.string().trim().min(3).max(30),
    vehicle: z.object({
      plate: z.string().trim().min(4).max(20),
      brand: z.string().trim().max(50).optional(),
      model: z.string().trim().max(50).optional(),
      year: z.coerce.number().int().min(1990).max(new Date().getFullYear() + 1).optional(),
      fuelType: z.enum(['Electric', 'Gasoline', 'Diesel', 'Hybrid']),
      vehicleType: z.enum(['AI', 'NOAI']),
    }),
  }),
]);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

async function issueTokens(
  userId: number,
  role: Role,
  email: string,
  clientId: number | null,
  driverId: number | null,
) {
  const accessToken = signAccess({ sub: userId, role, email, clientId, driverId });
  const { token, hash } = newRefreshToken();
  await svc.storeRefresh(userId, hash, refreshExpiry());
  return { accessToken, refreshToken: token };
}

// POST /auth/register
authRouter.post('/register', async (req, res, next) => {
  try {
    const b = parse(registerSchema, req.body);
    const passwordHash = await bcrypt.hash(b.password, 10);

    let userId: number;
    let clientId: number | null = null;
    let driverId: number | null = null;
    try {
      if (b.role === 'CLIENT') {
        ({ userId, clientId } = await svc.registerClient(b.email, passwordHash, b));
      } else {
        ({ userId, driverId } = await svc.registerDriver(b.email, passwordHash, b));
      }
    } catch (e: any) {
      if (e?.errorNum === 1) {
        // ORA-00001: the message names the violated unique constraint
        const plate = String(e.message).toUpperCase().includes('UQ_VEHICLE_PLATE');
        throw new HttpError(409, plate ? 'Plate already registered' : 'Email already registered');
      }
      throw e;
    }

    const tokens = await issueTokens(userId, b.role, b.email, clientId, driverId);
    res.status(201).json({ user: { id: userId, email: b.email, role: b.role }, ...tokens });
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
authRouter.post('/login', async (req, res, next) => {
  try {
    const b = parse(loginSchema, req.body);
    const u = await svc.findUserByEmail(b.email);
    if (!u) throw new HttpError(401, 'Invalid credentials');
    if (u.STATUS !== 'ACTIVE') throw new HttpError(403, 'Account is blocked');

    const ok = await bcrypt.compare(b.password, u.PASSWORD_HASH);
    if (!ok) throw new HttpError(401, 'Invalid credentials');

    const tokens = await issueTokens(u.USER_ID, u.ROLE, u.EMAIL, u.CLIENT_ID, u.DRIVER_ID);
    res.json({ user: { id: u.USER_ID, email: u.EMAIL, role: u.ROLE }, ...tokens });
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh  (rotates the refresh token)
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = parse(refreshSchema, req.body);
    const h = hashToken(refreshToken);
    const row = await svc.findValidRefresh(h);
    if (!row) throw new HttpError(401, 'Invalid or expired refresh token');

    const u = await svc.findUserById(row.USER_ID);
    if (!u || u.STATUS !== 'ACTIVE') throw new HttpError(401, 'Invalid refresh token');

    await svc.revokeRefresh(h); // rotate: old token can't be reused
    const tokens = await issueTokens(u.USER_ID, u.ROLE, u.EMAIL, u.CLIENT_ID, u.DRIVER_ID);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout
authRouter.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = parse(refreshSchema, req.body);
    await svc.revokeRefresh(hashToken(refreshToken));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
