import type { Browser, BrowserContext, CDPSession, Page, Request, Route } from 'playwright';
import { allowedHosts, isAllowed, isPrivateHost } from './allowlist';
import { config } from './config';
import { type ClientMessage, type Cursor, encodeFrame, type ServerMessage, type Theme, toCursor } from './protocol';
import { themeScript } from './theme';

// A regular desktop Chrome: headless Chromium's default user agent gets bot walls on some sites.
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

interface Tab {
  page: Page;
  cdp: CDPSession;
}

// Runs in the page: the cursor a real browser would show at (x, y). A string, not a function, so
// no build-tool helpers (tsx/esbuild's __name) end up in code that runs where they don't exist.
const CURSOR_AT = `(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  if (!el) return 'default';
  const css = getComputedStyle(el).cursor;
  if (css && css !== 'auto') return css;
  if (el.closest('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea, [contenteditable]')) return 'text';
  // over text, browsers show the I-beam
  for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return 'text';
  return 'default';
})`;

const isMainFrameNavigation = (request: Request) => {
  try {
    return request.isNavigationRequest() && request.frame().parentFrame() === null;
  } catch {
    return false; // service-worker requests have no frame
  }
};

/**
 * One visitor's browser: a fresh, isolated Chromium context (no cookies from anyone else, gone when
 * the socket closes) with one page per tab. The focused tab's screen is streamed as JPEG frames
 * (CDP screencast) and the visitor's mouse and keyboard are replayed on it.
 */
export class Session {
  private context: BrowserContext | null = null;
  private tabs = new Map<string, Tab>();
  private focused: string | null = null;
  private viewport = { width: 1024, height: 640 };
  private closed = false;
  private cursor: Cursor = 'default';
  private cursorBusy = false;
  private cursorAt = 0;
  private colorScheme: 'light' | 'dark' = 'light';

  constructor(
    private readonly browser: Browser,
    private readonly send: (message: ServerMessage | Buffer) => void
  ) {}

  async start() {
    this.context = await this.browser.newContext({
      viewport: this.viewport,
      userAgent: USER_AGENT,
      deviceScaleFactor: config.scale,
      locale: 'en-US',
      acceptDownloads: false,
      serviceWorkers: 'block', // they would bypass the navigation check below
      bypassCSP: true, // so the theme's fonts load on GitHub
    });
    // Only requests to hosts outside the allowlist are intercepted: anything to our own network is
    // refused, top-level navigations elsewhere are refused, subresources (CDNs, images) go through.
    await this.context.route(
      (url) => isPrivateHost(url.hostname) || !isAllowed(url.href, allowedHosts()),
      (route: Route) => {
        const request = route.request();
        const isPrivate = isPrivateHost(new URL(request.url()).hostname);
        if (!isMainFrameNavigation(request)) return isPrivate ? route.abort('blockedbyclient') : route.continue();
        const tab = this.tabOf(request.frame().page());
        if (tab) this.send({ t: 'blocked', tab, url: request.url() });
        return route.abort('blockedbyclient');
      }
    );
  }

  async handle(message: ClientMessage) {
    if (this.closed || !this.context) return;
    switch (message.t) {
      case 'open':
        return this.open(message.tab, message.url);
      case 'goto':
        return this.goto(message.tab, message.url);
      case 'close':
        return this.closeTab(message.tab);
      case 'focus':
        return this.focus(message.tab);
      // navigations aren't awaited: input keeps flowing to the page while it loads
      case 'back':
        void this.tabs.get(message.tab)?.page.goBack({ waitUntil: 'commit' }).catch(() => null);
        return;
      case 'forward':
        void this.tabs.get(message.tab)?.page.goForward({ waitUntil: 'commit' }).catch(() => null);
        return;
      case 'reload':
        void this.tabs.get(message.tab)?.page.reload({ waitUntil: 'commit' }).catch(() => null);
        return;
      case 'resize':
        return this.resize(message.w, message.h);
      case 'mouse': {
        const page = this.focusedPage();
        if (!page) return;
        const x = message.x * this.viewport.width;
        const y = message.y * this.viewport.height;
        if (message.kind === 'move') {
          await page.mouse.move(x, y);
          return void this.updateCursor(page, x, y);
        }
        await page.mouse.move(x, y);
        const options = { button: message.button, clickCount: message.clicks };
        return message.kind === 'down' ? page.mouse.down(options) : page.mouse.up(options);
      }
      case 'wheel': {
        const page = this.focusedPage();
        if (!page) return;
        await page.mouse.move(message.x * this.viewport.width, message.y * this.viewport.height);
        return page.mouse.wheel(message.dx, message.dy);
      }
      case 'key': {
        const page = this.focusedPage();
        // unknown key names throw — ignore them
        if (page) await (message.kind === 'down' ? page.keyboard.down(message.key) : page.keyboard.up(message.key)).catch(() => null);
        return;
      }
      case 'text':
        return this.focusedPage()?.keyboard.insertText(message.text);
      case 'theme':
        return this.setTheme(message.theme);
    }
  }

  async dispose() {
    this.closed = true;
    this.tabs.clear();
    await this.context?.close().catch(() => null);
  }

  // ---------------------------------------------------------------- tabs

  private tabOf(page: Page): string | null {
    for (const [id, tab] of this.tabs) if (tab.page === page) return id;
    return null;
  }

  private focusedPage() {
    return this.focused ? this.tabs.get(this.focused)?.page : undefined;
  }

  private async open(id: string, url: string) {
    if (this.tabs.has(id)) return this.goto(id, url);
    if (this.tabs.size >= config.maxTabs) {
      this.send({ t: 'error', code: 'tabs', message: `At most ${config.maxTabs} tabs can be open.` });
      return;
    }
    const page = await this.context!.newPage();
    await page.setViewportSize(this.viewport); // the window's current size, not the context's first one
    await page.emulateMedia({ colorScheme: this.colorScheme });
    const cdp = await this.context!.newCDPSession(page);
    this.tabs.set(id, { page, cdp });

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) void this.reportNav(id, true);
    });
    page.on('load', () => void this.reportNav(id, false));
    page.on('dialog', (dialog) => void dialog.dismiss().catch(() => null));
    // links that open a new window become a new tab on the visitor's side
    page.on('popup', async (popup) => {
      await popup.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => null);
      const target = popup.url();
      await popup.close().catch(() => null);
      if (target && target !== 'about:blank') this.send({ t: 'popup', url: target });
    });
    cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => null);
      if (this.focused === id) this.send(encodeFrame(id, Buffer.from(data, 'base64')));
    });

    if (!this.focused) await this.focus(id);
    await this.goto(id, url);
  }

  private async goto(id: string, url: string) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    if (!isAllowed(url, allowedHosts()) || isPrivateHost(new URL(url).hostname)) {
      this.send({ t: 'blocked', tab: id, url });
      return;
    }
    void tab.page.goto(url, { waitUntil: 'commit', timeout: 30_000 }).catch(() => null);
  }

  private async closeTab(id: string) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    this.tabs.delete(id);
    if (this.focused === id) this.focused = null;
    await tab.page.close().catch(() => null);
  }

  private async focus(id: string) {
    const next = this.tabs.get(id);
    if (!next || this.focused === id) return;
    const previous = this.focused ? this.tabs.get(this.focused) : undefined;
    this.focused = id;
    await previous?.cdp.send('Page.stopScreencast').catch(() => null);
    await this.startScreencast(next);
    await next.page.bringToFront().catch(() => null);
    void this.reportNav(id, false);
  }

  private async startScreencast(tab: Tab) {
    await tab.cdp
      .send('Page.startScreencast', {
        format: 'jpeg',
        quality: config.jpegQuality,
        maxWidth: Math.round(this.viewport.width * config.scale),
        maxHeight: Math.round(this.viewport.height * config.scale),
      })
      .catch(() => null);
  }

  private async resize(width: number, height: number) {
    if (width === this.viewport.width && height === this.viewport.height) return;
    this.viewport = { width, height };
    await Promise.all([...this.tabs.values()].map((t) => t.page.setViewportSize(this.viewport).catch(() => null)));
    const focused = this.focused ? this.tabs.get(this.focused) : undefined;
    if (focused) {
      await focused.cdp.send('Page.stopScreencast').catch(() => null);
      await this.startScreencast(focused);
    }
  }

  /** Match the mini-OS: light/dark, and our palette and fonts on every page (theme.ts). */
  private async setTheme(theme: Theme) {
    this.colorScheme = theme.mode;
    const script = themeScript(theme);
    // pages loaded from now on get it at document start (a later script runs last and wins)...
    await this.context!.addInitScript(script);
    // ...and open pages switch now
    await Promise.all(
      [...this.tabs.values()].map(async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme.mode }).catch(() => null);
        await page.evaluate(script).catch(() => null);
      })
    );
  }

  /** Tell the visitor what their pointer should look like — at most ~12 times a second. */
  private async updateCursor(page: Page, x: number, y: number) {
    const now = Date.now();
    if (this.cursorBusy || now - this.cursorAt < 80) return;
    this.cursorBusy = true;
    this.cursorAt = now;
    try {
      const cursor = toCursor(String(await page.evaluate(`${CURSOR_AT}(${JSON.stringify([x, y])})`)));
      if (cursor !== this.cursor) {
        this.cursor = cursor;
        this.send({ t: 'cursor', cursor });
      }
    } catch {
      /* the page navigated mid-check */
    } finally {
      this.cursorBusy = false;
    }
  }

  private async reportNav(id: string, loading: boolean) {
    const tab = this.tabs.get(id);
    if (!tab || this.closed) return;
    const [title, history] = await Promise.all([
      tab.page.title().catch(() => ''),
      tab.cdp.send('Page.getNavigationHistory').catch(() => null),
    ]);
    if (!this.tabs.has(id)) return;
    this.send({
      t: 'nav',
      tab: id,
      url: tab.page.url(),
      title,
      // the blank page every tab starts on doesn't count
      canBack: !!history && history.entries.slice(0, history.currentIndex).some((e) => e.url !== 'about:blank'),
      canForward: !!history && history.currentIndex < history.entries.length - 1,
      loading,
    });
  }
}
