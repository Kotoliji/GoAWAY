import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import * as svc from './auth.service';
import { Role, signAccess, newRefreshToken, hashToken, refreshExpiry } from './jwt';
import { HttpError } from '../common/errors';
import { parse } from '../common/validate';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['CLIENT', 'DRIVER', 'ADMIN']),
  clientId: z.coerce.number().int().positive().optional(),
  driverId: z.coerce.number().int().positive().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

async function issueTokens(userId: number, role: Role, email: string) {
  const accessToken = signAccess({ sub: userId, role, email });
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
    try {
      userId = await svc.createUser({
        email: b.email,
        passwordHash,
        role: b.role,
        clientId: b.clientId ?? null,
        driverId: b.driverId ?? null,
      });
    } catch (e: any) {
      if (e?.errorNum === 1) throw new HttpError(409, 'Email already registered'); // ORA-00001
      throw e; // CK_APP_USER_LINK (ORA-02290) is mapped to 400 by the global handler
    }

    const tokens = await issueTokens(userId, b.role, b.email);
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

    const tokens = await issueTokens(u.USER_ID, u.ROLE, u.EMAIL);
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
    const tokens = await issueTokens(u.USER_ID, u.ROLE, u.EMAIL);
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
