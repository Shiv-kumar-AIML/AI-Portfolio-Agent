import crypto from 'crypto';

// Constant-time comparison of the shared X-Internal-Service-Key (same as the api's safeEqual).
export const safeEqual = (provided: unknown, expected: string | undefined): boolean => {
  if (!expected || typeof provided !== 'string' || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
