import crypto from 'crypto';

// Constant-time comparison of a shared secret. A plain `===` leaks how many leading characters
// matched through response timing, which is enough to recover a key byte by byte. Every check of
// X-Internal-Service-Key or the admin token goes through here.
export const safeEqual = (provided: unknown, expected: string | undefined): boolean => {
  if (!expected || typeof provided !== 'string' || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const isValidInternalServiceKey = (provided: unknown): boolean =>
  safeEqual(provided, process.env.INTERNAL_SERVICE_KEY);
