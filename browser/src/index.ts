import 'dotenv/config';
import http from 'http';
import { type Browser, chromium } from 'playwright';
import { WebSocket, WebSocketServer } from 'ws';
import { safeEqual } from './auth';
import { config } from './config';
import { parseClientMessage, type ServerMessage } from './protocol';
import { Session } from './session';

/**
 * Internal service: one WebSocket per visitor at /session (only the api connects, with
 * X-Internal-Service-Key). Never published by nginx — see nginx/production.conf.
 */

// Frames are dropped (not queued) while the visitor's connection is this far behind.
const MAX_BUFFERED_BYTES = 2 * 1024 * 1024;

let browser: Promise<Browser> | null = null;
const getBrowser = () => {
  // headless screencasts ignore the context's deviceScaleFactor; only this flag sharpens the frames
  browser ??= chromium.launch({ args: ['--disable-dev-shm-usage', `--force-device-scale-factor=${config.scale}`] }).then((b) => {
    b.on('disconnected', () => (browser = null)); // relaunch on the next session
    return b;
  });
  browser.catch(() => (browser = null));
  return browser;
};

let sessions = 0;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', sessions, maxSessions: config.maxSessions }));
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/session' || !safeEqual(req.headers['x-internal-service-key'], process.env.INTERNAL_SERVICE_KEY)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => void run(ws));
});

async function run(ws: WebSocket) {
  const send = (message: ServerMessage | Buffer) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (Buffer.isBuffer(message)) {
      if (ws.bufferedAmount < MAX_BUFFERED_BYTES) ws.send(message, { binary: true });
    } else {
      ws.send(JSON.stringify(message));
    }
  };
  const fail = (code: 'busy' | 'expired', message: string) => {
    send({ t: 'error', code, message });
    ws.close(1013, code);
  };

  if (sessions >= config.maxSessions) return fail('busy', 'The live browser is busy — try again in a few minutes.');
  sessions++;
  let session: Session | null = null;
  let idle: NodeJS.Timeout | undefined;
  const touch = () => {
    clearTimeout(idle);
    idle = setTimeout(() => fail('expired', 'The live browser closed after being idle.'), config.idleMs);
  };
  const lifetime = setTimeout(() => fail('expired', 'The live browser session ended.'), config.maxSessionMs);
  // messages that arrive while Chromium is starting run once it's ready, in order
  let queue: Promise<unknown> = Promise.resolve();

  ws.on('close', () => {
    sessions--;
    clearTimeout(idle);
    clearTimeout(lifetime);
    queue = queue.then(() => session?.dispose());
  });
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    const message = parseClientMessage(data.toString());
    if (!message) return send({ t: 'error', code: 'invalid', message: 'Invalid message' });
    if (message.t !== 'resize') touch();
    queue = queue.then(() => session?.handle(message)).catch((error) => console.error('browser session:', error));
  });

  touch();
  queue = queue.then(async () => {
    try {
      session = new Session(await getBrowser(), send);
      await session.start();
      if (ws.readyState !== WebSocket.OPEN) return void session.dispose();
      send({ t: 'ready' });
    } catch (error) {
      console.error('Could not start a browser session:', error);
      fail('busy', 'The live browser is unavailable right now.');
    }
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (process kept running):', reason);
});
server.listen(config.port, config.host, () => {
  console.log(`Browser service listening on ${config.host}:${config.port}`);
});
