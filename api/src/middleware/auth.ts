import type { NextFunction, Request, Response } from 'express';
import { isValidInternalServiceKey, safeEqual } from '../utils/internalServiceKey';

/** Only the ai-service (on the internal Docker network) may call /internal/*. */
export const requireInternalService = (req: Request, res: Response, next: NextFunction) => {
  if (!isValidInternalServiceKey(req.get('X-Internal-Service-Key'))) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
};

/**
 * The owner's admin routes (messages inbox, chat analytics, reindex). Authenticated with a bearer
 * token from ADMIN_TOKEN; with no token configured the routes don't exist at all (404), so a
 * deployment that never set one exposes nothing.
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return res.status(404).json({ message: 'Not found' });
  const [scheme, token] = (req.get('Authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !safeEqual(token, expected)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
};
