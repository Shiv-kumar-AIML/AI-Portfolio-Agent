import type { IncomingMessage, Server } from 'http';
import type { Duplex } from 'stream';
import { type RawData, WebSocket, WebSocketServer } from 'ws';

/**
 * @openapi
 * /api/browser:
 *   get:
 *     tags: [Public]
 *     summary: WebSocket — a live remote browser for the mini-OS (relayed to the browser service)
 *     description: |
 *       Upgrade to a WebSocket. Messages are validated by the browser service; the protocol is in
 *       browser/src/protocol.ts. One connection per IP at a time, a few new ones per window.
 *     responses:
 *       101:
 *         description: Switching protocols
 *       403:
 *         description: Origin not allowed
 *       429:
 *         description: Too many live-browser connections from this IP
 *       503:
 *         description: The browser service is not configured
 */

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const PATH = '/api/browser';
// Production defaults are strict; in development every reload is a new socket from one IP.
const dev = process.env.NODE_ENV === 'development';
const MAX_OPEN_PER_IP = num(process.env.BROWSER_MAX_PER_IP, dev ? 5 : 1);
const MAX_NEW_PER_WINDOW = num(process.env.BROWSER_CONNECTIONS_PER_10_MIN, dev ? 200 : 6);
const WINDOW_MS = 10 * 60 * 1000;

const open = new Map<string, number>();
const recent = new Map<string, number[]>();

/** The client IP the way express's `trust proxy: 1` sees it: the last X-Forwarded-For hop. */
export const clientIp = (req: IncomingMessage) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return forwarded.at(-1) || req.socket.remoteAddress || 'unknown';
};

/** Same rule as the CORS setup: same-origin, or one of ALLOWED_ORIGINS. */
export const isAllowedOrigin = (req: IncomingMessage, allowedOrigins: string[]) => {
  const origin = req.headers.origin;
  if (!origin) return false; // browsers always send Origin on WebSocket upgrades
  if (allowedOrigins.includes(origin)) return true;
  try {
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    return new URL(origin).host === (forwardedHost || req.headers.host);
  } catch {
    return false;
  }
};

/** Counts this connection against the IP's limits; false = over the limit. */
export const admit = (ip: string, now = Date.now()) => {
  const times = (recent.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if ((open.get(ip) || 0) >= MAX_OPEN_PER_IP || times.length >= MAX_NEW_PER_WINDOW) {
    recent.set(ip, times);
    return false;
  }
  recent.set(ip, [...times, now]);
  open.set(ip, (open.get(ip) || 0) + 1);
  return true;
};

export const release = (ip: string) => {
  const left = (open.get(ip) || 1) - 1;
  if (left > 0) open.set(ip, left);
  else open.delete(ip);
};

export const resetBrowserLimits = () => {
  open.clear();
  recent.clear();
};

const reject = (socket: Duplex, status: number, text: string) => {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
};

/** Relays one visitor socket to the browser service, both ways, until either side closes. */
function relay(client: WebSocket, ip: string) {
  const upstream = new WebSocket(`${process.env.BROWSER_SERVICE_URL!.replace(/\/$/, '')}/session`, {
    headers: { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' },
  });
  let released = false;
  const done = () => {
    if (released) return;
    released = true;
    release(ip);
    if (client.readyState <= WebSocket.OPEN) client.close();
    if (upstream.readyState <= WebSocket.OPEN) upstream.terminate();
  };
  // what the visitor sends before the browser service has answered waits for it
  const pending: Array<[RawData, boolean]> = [];
  client.on('message', (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
    else if (pending.length < 50) pending.push([data, isBinary]);
  });
  upstream.on('open', () => {
    for (const [data, isBinary] of pending.splice(0)) upstream.send(data, { binary: isBinary });
  });
  upstream.on('message', (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });
  upstream.on('error', () => {
    // the browser service is down: tell the page, which falls back to its previews
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ t: 'error', code: 'busy', message: 'The live browser is unavailable right now.' }));
    }
    done();
  });
  client.on('error', done);
  client.on('close', done);
  upstream.on('close', done);
}

export function attachBrowserProxy(server: Server, allowedOrigins: string[]) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (new URL(req.url || '/', 'http://localhost').pathname !== PATH) return reject(socket, 404, 'Not Found');
    if (!process.env.BROWSER_SERVICE_URL) return reject(socket, 503, 'Service Unavailable');
    if (!isAllowedOrigin(req, allowedOrigins)) return reject(socket, 403, 'Forbidden');
    const ip = clientIp(req);
    if (!admit(ip)) return reject(socket, 429, 'Too Many Requests');
    wss.handleUpgrade(req, socket, head, (client) => relay(client, ip));
  });
}
