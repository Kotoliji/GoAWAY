import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';

export type Role = 'CLIENT' | 'DRIVER' | 'ADMIN';

export interface AccessPayload {
  sub: number; // app_user.user_id
  role: Role;
  email: string;
}

/** Short-lived access token (JWT). */
export function signAccess(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_TTL });
}

export function verifyAccess(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_SECRET) as unknown as AccessPayload;
}

/** Opaque refresh token: a random string; only its SHA-256 hash is stored. */
export function newRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('hex');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + env.JWT_REFRESH_TTL * 1000);
}
