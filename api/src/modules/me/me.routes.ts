import { Router } from 'express';
import { requireAuth } from '../../auth/auth.middleware';

export const meRouter = Router();

/** GET /me — returns the authenticated user's token claims. Protected. */
meRouter.get('/', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
