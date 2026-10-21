import { z } from 'zod';

/**
 * The WebSocket protocol between the mini-OS browser and this service (relayed by the api at
 * /api/browser). Client → server messages are JSON and validated here. Server → client messages
 * are JSON (ServerMessage) or binary screen frames: [1 byte: tab id length][tab id][JPEG].
 * Coordinates are fractions (0-1) of the viewport, so the client's display size doesn't matter.
 */

const tab = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);
const url = z.string().min(1).max(2000);
const coord = z.number().min(0).max(1);
// theme colours are injected into CSS, so only plain hex values pass
const hex = z.string().regex(/^#[0-9a-fA-F]{3,8}$/);

export const themeSchema = z.object({
  mode: z.enum(['light', 'dark']),
  colors: z.object({
    background: hex,
    foreground: hex,
    card: hex,
    muted: hex,
    mutedForeground: hex,
    border: hex,
    primary: hex,
    primaryForeground: hex,
    wood: hex,
    edge: hex,
  }),
});

export type Theme = z.infer<typeof themeSchema>;

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('open'), tab, url }),
  z.object({ t: z.literal('goto'), tab, url }),
  z.object({ t: z.literal('close'), tab }),
  z.object({ t: z.literal('focus'), tab }),
  z.object({ t: z.literal('back'), tab }),
  z.object({ t: z.literal('forward'), tab }),
  z.object({ t: z.literal('reload'), tab }),
  z.object({ t: z.literal('resize'), w: z.number().int().min(200).max(1600), h: z.number().int().min(150).max(1200) }),
  z.object({
    t: z.literal('mouse'),
    kind: z.enum(['move', 'down', 'up']),
    x: coord,
    y: coord,
    button: z.enum(['left', 'middle', 'right']).default('left'),
    clicks: z.number().int().min(1).max(3).default(1),
  }),
  z.object({ t: z.literal('wheel'), x: coord, y: coord, dx: z.number().min(-5000).max(5000), dy: z.number().min(-5000).max(5000) }),
  z.object({ t: z.literal('key'), kind: z.enum(['down', 'up']), key: z.string().min(1).max(24) }),
  z.object({ t: z.literal('text'), text: z.string().min(1).max(500) }),
  z.object({ t: z.literal('theme'), theme: themeSchema }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerMessage =
  | { t: 'ready' }
  | { t: 'nav'; tab: string; url: string; title: string; canBack: boolean; canForward: boolean; loading: boolean }
  | { t: 'blocked'; tab: string; url: string }
  | { t: 'popup'; url: string }
  | { t: 'cursor'; cursor: Cursor }
  | { t: 'error'; code: 'busy' | 'tabs' | 'invalid' | 'expired'; message: string };

/** The mouse cursor over the page — what the visitor's pointer should look like. */
export const CURSORS = ['default', 'pointer', 'text', 'move', 'grab', 'grabbing', 'not-allowed', 'wait', 'progress', 'crosshair', 'help', 'col-resize', 'row-resize', 'ew-resize', 'ns-resize', 'zoom-in', 'zoom-out'] as const;
export type Cursor = (typeof CURSORS)[number];

export const toCursor = (value: string): Cursor => ((CURSORS as readonly string[]).includes(value) ? (value as Cursor) : 'default');

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed = clientMessageSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function encodeFrame(tabId: string, jpeg: Buffer): Buffer {
  const id = Buffer.from(tabId, 'ascii');
  return Buffer.concat([Buffer.from([id.length]), id, jpeg]);
}
