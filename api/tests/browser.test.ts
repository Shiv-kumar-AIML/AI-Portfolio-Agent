import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocket, WebSocketServer } from 'ws';
import { admit, attachBrowserProxy, isAllowedOrigin, release, resetBrowserLimits } from '../src/services/BrowserProxy';

const ORIGIN = 'http://localhost:5173';

describe('live browser relay (/api/browser)', () => {
  let upstream: WebSocketServer;
  let server: http.Server;
  let base: string;
  const seenKeys: unknown[] = [];

  beforeAll(async () => {
    // a stand-in browser service that echoes text and answers with one binary frame
    upstream = new WebSocketServer({ port: 0 });
    upstream.on('connection', (ws, req) => {
      seenKeys.push(req.headers['x-internal-service-key']);
      ws.on('message', (data, isBinary) => {
        ws.send(data, { binary: isBinary });
        ws.send(Buffer.from([1, 2, 3]), { binary: true });
      });
    });
    await new Promise((r) => upstream.once('listening', r));
    process.env.BROWSER_SERVICE_URL = `ws://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

    server = http.createServer((_req, res) => res.end());
    attachBrowserProxy(server, [ORIGIN]);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    delete process.env.BROWSER_SERVICE_URL;
    upstream.clients.forEach((c) => c.terminate());
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await new Promise((r) => upstream.close(r));
  });

  beforeEach(resetBrowserLimits);

  const connect = (path = '/api/browser', origin = ORIGIN) => new WebSocket(`${base}${path}`, { origin });
  const statusOf = (ws: WebSocket) =>
    new Promise<number>((resolve) => {
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode || 0));
      ws.on('open', () => resolve(101));
      ws.on('error', () => undefined);
    });

  it('relays both ways with the internal key, keeping binary frames binary', async () => {
    const ws = connect();
    await new Promise((r) => ws.once('open', r));
    const received: Array<{ data: string; binary: boolean }> = [];
    const two = new Promise<void>((resolve) =>
      ws.on('message', (data, binary) => {
        received.push({ data: binary ? [...(data as Buffer)].join(',') : data.toString(), binary });
        if (received.length === 2) resolve();
      })
    );
    ws.send(JSON.stringify({ t: 'focus', tab: 't1' }));
    await two;
    expect(received).toEqual([
      { data: '{"t":"focus","tab":"t1"}', binary: false },
      { data: '1,2,3', binary: true },
    ]);
    expect(seenKeys.at(-1)).toBe(process.env.INTERNAL_SERVICE_KEY);
    ws.close();
  });

  it('refuses other origins, other paths and a second socket from the same IP', async () => {
    expect(await statusOf(connect('/api/browser', 'https://evil.example'))).toBe(403);
    expect(await statusOf(connect('/api/other'))).toBe(404);
    const first = connect();
    expect(await statusOf(first)).toBe(101);
    expect(await statusOf(connect())).toBe(429);
    first.close();
  });
});

describe('browser relay helpers', () => {
  beforeEach(resetBrowserLimits);

  it('accepts same-origin upgrades without listing the origin', () => {
    const req = { headers: { origin: 'https://shiv.dev', host: 'shiv.dev' } } as unknown as http.IncomingMessage;
    expect(isAllowedOrigin(req, [])).toBe(true);
    const noOrigin = { headers: { host: 'shiv.dev' } } as unknown as http.IncomingMessage;
    expect(isAllowedOrigin(noOrigin, [])).toBe(false);
  });

  it('limits new connections per IP within the window', () => {
    for (let i = 0; i < 6; i++) {
      expect(admit('1.2.3.4', i)).toBe(true);
      release('1.2.3.4');
    }
    expect(admit('1.2.3.4', 10)).toBe(false);
    expect(admit('1.2.3.4', 11 * 60 * 1000)).toBe(true);
  });
});
