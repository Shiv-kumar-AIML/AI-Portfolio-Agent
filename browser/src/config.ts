import path from 'path';

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  port: num(process.env.PORT, 8090),
  host: process.env.HOST || '127.0.0.1',
  // Each session is a Chromium context (~100-300 MB): this caps the memory the service can take.
  maxSessions: num(process.env.BROWSER_MAX_SESSIONS, 3),
  maxTabs: num(process.env.BROWSER_MAX_TABS, 4),
  idleMs: num(process.env.BROWSER_IDLE_MS, 5 * 60 * 1000),
  maxSessionMs: num(process.env.BROWSER_MAX_SESSION_MS, 20 * 60 * 1000),
  jpegQuality: num(process.env.BROWSER_JPEG_QUALITY, 85),
  // Pages render at this pixel ratio: the frames are scaled (and tilted onto the laptop screen) on
  // the visitor's side, and a sharper source keeps the text crisp through that.
  scale: Math.min(3, num(process.env.BROWSER_SCALE, 2)),
  // Hosts allowed besides GitHub, LinkedIn and the profile's own links (comma-separated).
  extraHosts: (process.env.BROWSER_EXTRA_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
};

// content/ is shared with the api and ai-service (mounted read-only at /content in Docker).
export const contentDir = () => process.env.CONTENT_DIR || path.resolve(process.cwd(), '../content');
