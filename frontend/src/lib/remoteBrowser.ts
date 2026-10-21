import { wsUrl } from '@/lib/api'

/**
 * Client for the live browser: a real Chromium on our server (browser/ service, relayed by the api
 * at /api/browser). It streams JPEG frames of the focused tab; we send back mouse, wheel and keys.
 * Protocol: browser/src/protocol.ts.
 *
 * Status: idle (no socket) → connecting → live; `unavailable` when the service is down or busy (the
 * mini-OS then shows its previews), `ended` when the server closed an idle or long session.
 */

export type RemoteStatus = 'idle' | 'connecting' | 'live' | 'unavailable' | 'ended'

export interface RemoteTab {
  url: string
  title: string
  canBack: boolean
  canForward: boolean
  loading: boolean
  /** a page the live browser refused to open (not on its allowlist) */
  blocked?: string
}

type ServerMessage =
  | { t: 'ready' }
  | { t: 'nav'; tab: string; url: string; title: string; canBack: boolean; canForward: boolean; loading: boolean }
  | { t: 'blocked'; tab: string; url: string }
  | { t: 'popup'; url: string }
  | { t: 'cursor'; cursor: string }
  | { t: 'error'; code: string; message: string }

/** The mini-OS look the live pages are restyled to (browser/src/theme.ts). Hex colours only. */
export interface RemoteTheme {
  mode: 'light' | 'dark'
  colors: Record<'background' | 'foreground' | 'card' | 'muted' | 'mutedForeground' | 'border' | 'primary' | 'primaryForeground' | 'wood' | 'edge', string>
}

const THEME_TOKENS: Record<keyof RemoteTheme['colors'], string> = {
  background: '--background',
  foreground: '--foreground',
  card: '--card',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  border: '--border',
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  wood: '--wood',
  edge: '--vx-edge',
}

/** Reads the page's current theme tokens (index.css), or null if any isn't a plain hex colour. */
export function readTheme(mode: 'light' | 'dark', root: Element = document.documentElement): RemoteTheme | null {
  const style = getComputedStyle(root)
  const colors = {} as RemoteTheme['colors']
  for (const [key, token] of Object.entries(THEME_TOKENS) as Array<[keyof RemoteTheme['colors'], string]>) {
    const value = style.getPropertyValue(token).trim()
    if (!/^#[0-9a-f]{3,8}$/i.test(value)) return null
    colors[key] = value
  }
  return { mode, colors }
}

export type ClientMessage =
  | { t: 'open' | 'goto'; tab: string; url: string }
  | { t: 'close' | 'focus' | 'back' | 'forward' | 'reload'; tab: string }
  | { t: 'resize'; w: number; h: number }
  | { t: 'mouse'; kind: 'move' | 'down' | 'up'; x: number; y: number; button: 'left' | 'middle' | 'right'; clicks: number }
  | { t: 'wheel'; x: number; y: number; dx: number; dy: number }
  | { t: 'key'; kind: 'down' | 'up'; key: string }
  | { t: 'text'; text: string }
  | { t: 'theme'; theme: RemoteTheme }

/** Splits a binary frame: [1 byte: tab id length][tab id][JPEG]. */
export function decodeFrame(buffer: ArrayBuffer): { tab: string; jpeg: Blob } {
  const bytes = new Uint8Array(buffer)
  const n = bytes[0]
  return {
    tab: String.fromCharCode(...bytes.subarray(1, 1 + n)),
    jpeg: new Blob([bytes.subarray(1 + n)], { type: 'image/jpeg' }),
  }
}

export class RemoteBrowser {
  status: RemoteStatus = 'idle'
  message = ''
  /** the CSS cursor for the pointer over the page (the server only sends known keywords) */
  cursor = 'default'
  tabs = new Map<string, RemoteTab>()
  /** the URL last sent for each tab, so the same open isn't repeated */
  private requested = new Map<string, string>()
  private focused: string | null = null
  private size: { w: number; h: number } | null = null
  private theme: RemoteTheme | null = null
  private socket: WebSocket | null = null
  private queue: ClientMessage[] = []
  private listeners = new Set<() => void>()
  private frameListeners = new Set<(tab: string, jpeg: Blob) => void>()
  version = 0

  onNav: (tab: string, url: string) => void = () => {}
  onPopup: (url: string) => void = () => {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  getVersion = () => this.version

  onFrame(listener: (tab: string, jpeg: Blob) => void) {
    this.frameListeners.add(listener)
    return () => void this.frameListeners.delete(listener)
  }

  private changed() {
    this.version++
    this.listeners.forEach((l) => l())
  }

  private send(message: ClientMessage) {
    if (this.status === 'unavailable' || this.status === 'ended') return
    if (this.status === 'live' && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message))
      return
    }
    // resizes and pointer moves only matter once live; everything else waits for the session
    if (message.t !== 'mouse' && message.t !== 'wheel' && message.t !== 'key' && message.t !== 'text') this.queue.push(message)
    if (this.status === 'idle') this.connect()
  }

  private connect() {
    this.status = 'connecting'
    this.changed()
    let socket: WebSocket
    try {
      socket = new WebSocket(wsUrl('/api/browser'))
    } catch {
      return this.fail('unavailable', 'The live browser is unavailable right now.')
    }
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const { tab, jpeg } = decodeFrame(event.data)
        this.frameListeners.forEach((l) => l(tab, jpeg))
        return
      }
      let message: ServerMessage
      try {
        message = JSON.parse(String(event.data))
      } catch {
        return
      }
      this.handle(message)
    }
    socket.onclose = () => {
      if (this.socket !== socket) return
      this.socket = null
      if (this.status === 'live') this.fail('ended', 'The live browser session ended.')
      else if (this.status === 'connecting') this.fail('unavailable', 'The live browser is unavailable right now.')
    }
  }

  private handle(message: ServerMessage) {
    switch (message.t) {
      case 'ready': {
        this.status = 'live'
        const pending = this.queue.splice(0)
        if (this.theme) this.socket?.send(JSON.stringify({ t: 'theme', theme: this.theme }))
        if (this.size) this.socket?.send(JSON.stringify({ t: 'resize', ...this.size }))
        pending.filter((m) => m.t !== 'resize' && m.t !== 'theme').forEach((m) => this.socket?.send(JSON.stringify(m)))
        if (this.focused) this.socket?.send(JSON.stringify({ t: 'focus', tab: this.focused }))
        break
      }
      case 'nav':
        this.tabs.set(message.tab, {
          url: message.url,
          title: message.title,
          canBack: message.canBack,
          canForward: message.canForward,
          loading: message.loading,
        })
        if (message.url !== 'about:blank') {
          this.requested.set(message.tab, message.url)
          this.onNav(message.tab, message.url)
        }
        break
      case 'blocked': {
        const tab = this.tabs.get(message.tab)
        this.tabs.set(message.tab, { url: '', title: '', canBack: false, canForward: false, ...tab, loading: false, blocked: message.url })
        break
      }
      case 'popup':
        this.onPopup(message.url)
        break
      case 'cursor':
        this.cursor = /^[a-z-]{1,20}$/.test(message.cursor) ? message.cursor : 'default'
        break
      case 'error':
        if (message.code === 'busy') return this.fail('unavailable', message.message)
        if (message.code === 'expired') return this.fail('ended', message.message)
        this.message = message.message
        break
    }
    this.changed()
  }

  private fail(status: 'unavailable' | 'ended', message: string) {
    this.status = status
    this.message = message
    this.queue = []
    const socket = this.socket
    this.socket = null
    socket?.close()
    this.changed()
  }

  // ---------------------------------------------------------------- tabs

  /** Show `url` in `tab` (opening the tab on the server if needed). */
  open(tab: string, url: string) {
    if (this.requested.get(tab) === url) return
    this.requested.set(tab, url)
    const known = this.tabs.get(tab)
    if (known?.blocked) this.tabs.set(tab, { ...known, blocked: undefined })
    this.send({ t: 'open', tab, url })
  }

  focus(tab: string) {
    if (this.focused === tab) return
    this.focused = tab
    if (this.status === 'live') this.send({ t: 'focus', tab })
  }

  /** Forget server tabs the visitor has closed. */
  keepOnly(tabs: string[]) {
    for (const tab of [...this.requested.keys()]) {
      if (tabs.includes(tab)) continue
      this.requested.delete(tab)
      this.tabs.delete(tab)
      if (this.focused === tab) this.focused = null
      this.send({ t: 'close', tab })
    }
  }

  back = (tab: string) => this.send({ t: 'back', tab })
  forward = (tab: string) => this.send({ t: 'forward', tab })
  reload = (tab: string) => this.send({ t: 'reload', tab })

  resize(w: number, h: number) {
    const size = { w: Math.round(Math.min(1600, Math.max(200, w))), h: Math.round(Math.min(1200, Math.max(150, h))) }
    if (this.size?.w === size.w && this.size?.h === size.h) return
    this.size = size
    if (this.status === 'live') this.send({ t: 'resize', ...size })
  }

  /** Restyle the live pages to the mini-OS theme (sent again whenever it changes). */
  setTheme(theme: RemoteTheme) {
    if (JSON.stringify(theme) === JSON.stringify(this.theme)) return
    this.theme = theme
    if (this.status === 'live') this.send({ t: 'theme', theme })
  }

  input(message: Extract<ClientMessage, { t: 'mouse' | 'wheel' | 'key' | 'text' }>) {
    this.send(message)
  }

  /** Close the session (the browser window closed). */
  disconnect() {
    const socket = this.socket
    this.socket = null
    socket?.close()
    this.reset('idle')
  }

  /** Start over after `ended` / `unavailable`: the next open() connects again. */
  restart() {
    this.disconnect()
  }

  private reset(status: RemoteStatus) {
    this.status = status
    this.message = ''
    this.queue = []
    this.tabs.clear()
    this.requested.clear()
    this.focused = null
    this.changed()
  }
}
