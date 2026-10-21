import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isLiveUrl, NEW_TAB } from '@/lib/browserUrl'
import { decodeFrame, RemoteBrowser } from '@/lib/remoteBrowser'

class FakeSocket {
  static last: FakeSocket
  static OPEN = 1
  readyState = 1
  sent: unknown[] = []
  binaryType = ''
  onmessage: ((e: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  readonly url: string
  constructor(url: string) {
    this.url = url
    FakeSocket.last = this
  }
  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  close() {
    this.readyState = 3
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })
})
afterEach(() => vi.unstubAllGlobals())

describe('RemoteBrowser', () => {
  it('connects on the first open and sends what waited once the session is ready', () => {
    const remote = new RemoteBrowser()
    remote.resize(900, 600)
    remote.focus('t1')
    remote.open('t1', 'https://github.com/octo')
    remote.open('t1', 'https://github.com/octo') // same address: not sent twice
    expect(remote.status).toBe('connecting')
    const socket = FakeSocket.last
    expect(socket.url).toBe('ws://localhost:5173/api/browser')
    socket.receive({ t: 'ready' })
    expect(remote.status).toBe('live')
    expect(socket.sent).toEqual([
      { t: 'resize', w: 900, h: 600 },
      { t: 'open', tab: 't1', url: 'https://github.com/octo' },
      { t: 'focus', tab: 't1' },
    ])
  })

  it('reports navigations in the page and falls back when the service is busy', () => {
    const remote = new RemoteBrowser()
    const navs: string[] = []
    remote.onNav = (tab, url) => navs.push(`${tab} ${url}`)
    remote.open('t1', 'https://github.com/octo')
    FakeSocket.last.receive({ t: 'ready' })
    FakeSocket.last.receive({ t: 'nav', tab: 't1', url: 'https://github.com/octo/rag', title: 'rag', canBack: true, canForward: false, loading: false })
    expect(navs).toEqual(['t1 https://github.com/octo/rag'])
    expect(remote.tabs.get('t1')?.canBack).toBe(true)

    const busy = new RemoteBrowser()
    busy.open('t1', 'https://github.com/octo')
    FakeSocket.last.receive({ t: 'error', code: 'busy', message: 'The live browser is busy' })
    expect(busy.status).toBe('unavailable')
    busy.restart()
    expect(busy.status).toBe('idle')
  })

  it('sends the theme first, and again only when it changes', () => {
    const remote = new RemoteBrowser()
    const theme = { mode: 'dark' as const, colors: { background: '#000', foreground: '#fff', card: '#111', muted: '#222', mutedForeground: '#999', border: '#333', primary: '#4fb3bb', primaryForeground: '#000', wood: '#e39a62', edge: '#000' } }
    remote.setTheme(theme)
    remote.open('t1', 'https://github.com/a')
    FakeSocket.last.receive({ t: 'ready' })
    expect(FakeSocket.last.sent[0]).toEqual({ t: 'theme', theme })
    remote.setTheme({ ...theme })
    expect(FakeSocket.last.sent.filter((m) => (m as { t: string }).t === 'theme')).toHaveLength(1)
  })

  it('closes server tabs the visitor closed', () => {
    const remote = new RemoteBrowser()
    remote.open('t1', 'https://github.com/a')
    remote.open('t2', 'https://github.com/b')
    FakeSocket.last.receive({ t: 'ready' })
    remote.keepOnly(['t2'])
    expect(FakeSocket.last.sent.at(-1)).toEqual({ t: 'close', tab: 't1' })
  })
})

describe('frames and live URLs', () => {
  it('splits the tab id off a frame', async () => {
    const { tab, jpeg } = decodeFrame(new Uint8Array([2, 0x74, 0x37, 0xff, 0xd8]).buffer)
    expect(tab).toBe('t7')
    expect([...new Uint8Array(await jpeg.arrayBuffer())]).toEqual([0xff, 0xd8])
  })

  it('sends web pages to the live browser, but not our own files or the new tab', () => {
    expect(isLiveUrl('https://github.com/octo', 'http://localhost:5173')).toBe(true)
    expect(isLiveUrl('http://localhost:5173/resume.pdf', 'http://localhost:5173')).toBe(false)
    expect(isLiveUrl(NEW_TAB, 'http://localhost:5173')).toBe(false)
  })
})
