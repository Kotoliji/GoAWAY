import { Router } from 'express';
import { requireAuth } from '../../auth/auth.middleware';
import { getProfile } from '../../auth/auth.service';

export const meRouter = Router();

/** GET /me — the authenticated user's token claims. Protected. */
meRouter.get('/', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/** GET /me/profile — the CLIENT or DRIVER (+ vehicle) row behind the login. */
meRouter.get('/profile', requireAuth, async (req, res, next) => {
  try {
    const profile = await getProfile(req.user!.clientId, req.user!.driverId);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});
