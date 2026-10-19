import rateLimit from 'express-rate-limit';

// Every chat turn costs LLM tokens (Groq free tier has per-minute and per-day caps shared by ALL
// visitors), so chat carries both a burst limit and a daily cap per IP. Limits are env-tunable.
const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const limiter = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message },
  });

export const chatBurstLimiter = limiter(
  60 * 1000,
  num(process.env.CHAT_RATE_LIMIT_PER_MINUTE, 15),
  'You are sending messages too quickly — please wait a moment.'
);

export const chatDailyLimiter = limiter(
  24 * 60 * 60 * 1000,
  num(process.env.CHAT_RATE_LIMIT_PER_DAY, 150),
  'Daily chat limit reached — please come back tomorrow, or use the contact form.'
);

export const contactLimiter = limiter(
  60 * 60 * 1000,
  num(process.env.CONTACT_RATE_LIMIT_PER_HOUR, 5),
  'Too many messages — please try again later.'
);

export const publicReadLimiter = limiter(60 * 1000, 120, 'Too many requests.');
