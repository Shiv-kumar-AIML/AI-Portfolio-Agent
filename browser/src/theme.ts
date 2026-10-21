import type { Theme } from './protocol';

/**
 * Restyles live pages to match the mini-OS. GitHub draws everything from Primer's CSS variables, so
 * overriding those (and its font stacks) carries our palette and fonts through the whole page.
 * Other sites get their colours mapped onto the palette (genericThemeScript).
 */

const FONTS =
  "@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300..800&family=Geist+Mono:wght@400..700&family=Pixelify+Sans:wght@400..700&display=swap');";

export function githubCss({ colors: c }: Theme): string {
  const vars: Record<string, string> = {
    // surfaces and text
    '--bgColor-default': c.background,
    '--bgColor-muted': c.muted,
    '--bgColor-inset': c.muted,
    '--bgColor-neutral-muted': c.muted,
    '--bgColor-emphasis': c.edge,
    '--bgColor-accent-emphasis': c.primary,
    '--bgColor-accent-muted': `color-mix(in srgb, ${c.primary} 14%, transparent)`,
    '--fgColor-default': c.foreground,
    '--fgColor-muted': c.mutedForeground,
    '--fgColor-accent': c.primary,
    '--fgColor-link': c.primary,
    '--fgColor-onEmphasis': c.primaryForeground,
    '--borderColor-default': c.border,
    '--borderColor-muted': c.border,
    '--borderColor-emphasis': c.edge,
    '--borderColor-accent-emphasis': c.primary,
    // the wood title bar of every OS window
    '--header-bgColor': c.wood,
    '--header-fgColor-default': '#ffffff',
    '--header-fgColor-logo': '#ffffff',
    '--header-borderColor-divider': c.edge,
    '--headerSearch-bgColor': `color-mix(in srgb, ${c.edge} 25%, ${c.wood})`,
    '--headerSearch-borderColor': c.edge,
    // buttons
    '--button-default-bgColor-rest': c.card,
    '--button-default-bgColor-hover': c.muted,
    '--button-default-bgColor-active': c.muted,
    '--button-default-borderColor-rest': c.edge,
    '--button-default-borderColor-hover': c.edge,
    '--button-default-fgColor-rest': c.foreground,
    '--button-primary-bgColor-rest': c.primary,
    '--button-primary-bgColor-hover': c.primary,
    '--button-primary-bgColor-active': c.primary,
    '--button-primary-borderColor-rest': c.edge,
    '--button-primary-borderColor-hover': c.edge,
    '--button-primary-fgColor-rest': c.primaryForeground,
    '--button-primary-iconColor-rest': c.primaryForeground,
    '--underlineNav-borderColor-active': c.wood,
    // fonts
    '--fontStack-sansSerif': "'Geist', system-ui, sans-serif",
    '--fontStack-system': "'Geist', system-ui, sans-serif",
    '--fontStack-sansSerifDisplay': "'Pixelify Sans', 'Geist', sans-serif",
    '--fontStack-monospace': "'Geist Mono', ui-monospace, monospace",
    // older Primer names some pages still use
    '--color-canvas-default': c.background,
    '--color-canvas-subtle': c.muted,
    '--color-fg-default': c.foreground,
    '--color-fg-muted': c.mutedForeground,
    '--color-accent-fg': c.primary,
    '--color-accent-emphasis': c.primary,
    '--color-border-default': c.border,
  };
  const declarations = Object.entries(vars)
    .map(([k, v]) => `${k}: ${v} !important;`)
    .join('\n  ');
  return `${FONTS}
html, html[data-color-mode] {
  ${declarations}
}
body { font-family: var(--fontStack-sansSerif) !important; background: ${c.background} !important; }
/* the logged-out header has its own black background */
header.HeaderMktg, header.header-logged-out, .AppHeader {
  --MarketingHeader-canvas-default: ${c.wood} !important;
  background-color: ${c.wood} !important;
  border-bottom: 2px solid ${c.edge} !important;
}
header.HeaderMktg [class*="backdrop"], header.HeaderMktg [class*="menuWrapper"] { background-color: transparent !important; }
.octicon-file-directory-fill, .icon-directory { color: ${c.wood} !important; fill: ${c.wood} !important; }
h1, h2, .h1, .h2, [itemprop="name"] { font-family: var(--fontStack-sansSerifDisplay) !important; }
/* voxel blocks: hard edges and a solid bottom "side", like the OS's cards and buttons */
.btn, .Button, button[data-component="IconButton"] { box-shadow: 0 2px 0 ${c.edge} !important; }
.Box, .Box--condensed, .border.rounded-2 { border-color: ${c.edge} !important; box-shadow: 0 3px 0 ${c.edge}; }
`;
}

/** A script that installs the style on GitHub pages — at document start and after Turbo navigations. */
export function githubStyleScript(theme: Theme): string {
  return `(() => {
  if (!/(^|\\.)github\\.com$/.test(location.hostname)) return;
  const css = ${JSON.stringify(githubCss(theme))};
  const put = () => {
    let style = document.getElementById('shivos-theme');
    if (!style) {
      style = document.createElement('style');
      style.id = 'shivos-theme';
    }
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style); // last, so it wins
  };
  // at document start there is no <html> yet: wait for it
  document.addEventListener('readystatechange', put);
  document.addEventListener('DOMContentLoaded', put);
  document.addEventListener('turbo:load', put);
  if (document.documentElement) put();
})();`;
}

/**
 * Every other site. Pages there don't share a set of variables, so this reads each element's own
 * colours and maps them onto the palette: neutral surfaces by lightness (page → background, raised
 * → card, tinted → muted, dark bars → edge), grey text to our foreground/muted text, grey borders to
 * the border colour, and blues (links, brand buttons) to the teal accent. Other hues (red badges,
 * green ticks) and images stay as they are. The original colours are remembered, so a theme change
 * remaps from them, and new content is mapped as it appears.
 */
export function genericThemeScript(theme: Theme): string {
  return `(() => {
  if (/(^|\\.)github\\.com$/.test(location.hostname)) return; // GitHub gets the Primer theme
  const theme = ${JSON.stringify(theme)};
  if (window.__shivos) return window.__shivos.apply(theme);

  const originals = new WeakMap();
  let palette = theme.colors;
  const SKIP = new Set(['IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'SOURCE', 'IFRAME', 'svg', 'path', 'SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'BR']);
  const ICON_FONT = /icon|material|symbol|awesome|glyph|mono|code|courier/i;

  const parse = (v) => {
    const m = /^rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)$/.exec(v);
    return m ? [+m[1] / 255, +m[2] / 255, +m[3] / 255, m[4] === undefined ? 1 : +m[4]] : null;
  };
  const hsl = ([r, g, b]) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
  };
  const isBlue = (h, s, l) => s > 0.35 && h >= 190 && h <= 240 && l > 0.2 && l < 0.75;
  const neutral = (s) => s < 0.16;

  // which palette colour an element's original colours become (null = leave it)
  const mapBg = (c, dark) => {
    if (!c || c[3] < 0.5) return null;
    const [h, s, l] = hsl(c);
    if (isBlue(h, s, l)) return palette.primary;
    if (!neutral(s)) return null;
    if (dark) return l < 0.1 ? palette.background : l < 0.2 ? palette.card : l < 0.35 ? palette.muted : null;
    return l >= 0.985 ? palette.card : l >= 0.88 ? palette.background : l >= 0.7 ? palette.muted : l < 0.3 ? palette.edge : null;
  };
  const mapText = (c, dark) => {
    if (!c) return null;
    const [h, s, l] = hsl(c);
    if (isBlue(h, s, l)) return palette.primary;
    if (!neutral(s)) return null;
    if (dark) return l > 0.75 ? palette.foreground : l > 0.45 ? palette.mutedForeground : null;
    return l < 0.35 ? palette.foreground : l < 0.68 ? palette.mutedForeground : null;
  };
  const mapBorder = (c) => {
    if (!c || c[3] < 0.2) return null;
    const [h, s, l] = hsl(c);
    if (isBlue(h, s, l)) return palette.primary;
    return neutral(s) ? palette.border : null;
  };

  // is the page itself dark (it honoured prefers-color-scheme), so its bands are inverted
  let pageDark = false;
  const measurePage = () => {
    const bg = parse(getComputedStyle(document.body || document.documentElement).backgroundColor) ||
      parse(getComputedStyle(document.documentElement).backgroundColor);
    pageDark = !!bg && bg[3] > 0.5 && hsl(bg)[2] < 0.4;
  };

  const PROPS = ['background-color', 'color', 'border-color', 'font-family'];
  // fresh = its classes changed: drop our override and read its own colours again
  const style = (el, fresh) => {
    if (SKIP.has(el.tagName) || el.closest('svg')) return;
    if (fresh && originals.has(el)) {
      originals.delete(el);
      for (const p of PROPS) el.style.removeProperty(p);
    }
    let o = originals.get(el);
    if (!o) {
      const cs = getComputedStyle(el);
      o = {
        bg: parse(cs.backgroundColor),
        fg: parse(cs.color),
        bd: cs.borderTopWidth !== '0px' || cs.borderBottomWidth !== '0px' || cs.borderLeftWidth !== '0px' ? parse(cs.borderTopColor) : null,
        // the first family decides: stacks often end in emoji/symbol fallbacks
        font: ICON_FONT.test(cs.fontFamily.split(',')[0]) ? null : cs.fontFamily,
      };
    }
    const set = (prop, value) => (value ? el.style.setProperty(prop, value, 'important') : el.style.removeProperty(prop));
    const bg = mapBg(o.bg, pageDark);
    set('background-color', bg);
    // light text on what became our accent takes the accent's own text colour (readable in both modes)
    const onAccent = bg === palette.primary && o.fg && neutral(hsl(o.fg)[1]) && hsl(o.fg)[2] > 0.8;
    set('color', onAccent ? palette.primaryForeground : mapText(o.fg, pageDark));
    set('border-color', o.bd && mapBorder(o.bd));
    if (o.font) set('font-family', /^H[12]$/.test(el.tagName) ? "'Pixelify Sans', 'Geist', sans-serif" : "'Geist', system-ui, sans-serif");
    // remembered only once overridden (the computed colours are ours from then on)
    originals.set(el, o);
  };

  const fonts = document.createElement('style');
  const sheet = () => ${JSON.stringify(FONTS)} +
    ' ::placeholder { color: ' + palette.mutedForeground + ' !important; opacity: 1 !important; }' +
    ' input, textarea, select { caret-color: ' + palette.foreground + ' !important; }';

  const all = () => {
    if (!document.body) return;
    fonts.textContent = sheet();
    if (!fonts.isConnected) (document.head || document.documentElement).appendChild(fonts);
    measurePage();
    document.documentElement.style.setProperty('background-color', palette.background, 'important');
    for (const el of document.body.querySelectorAll('*')) style(el);
    style(document.body);
  };

  // new and changed content, at most once per frame
  const pending = new Set();
  let frame = 0;
  const flush = () => {
    frame = 0;
    for (const root of pending) {
      if (!root.isConnected) continue;
      style(root, true);
      for (const el of root.querySelectorAll('*')) style(el, true);
    }
    for (const el of restyled) if (el.isConnected) style(el, true);
    pending.clear();
    restyled.clear();
  };
  const restyled = new Set();
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') restyled.add(r.target);
      else for (const n of r.addedNodes) if (n.nodeType === 1) pending.add(n);
    }
    if ((pending.size || restyled.size) && !frame) frame = requestAnimationFrame(flush);
  });

  // only once the page's own CSS has loaded: before that its colours aren't final
  const start = () => {
    all();
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  };
  window.__shivos = {
    apply(next) {
      palette = next.colors;
      all();
    },
  };
  // start once the stylesheets are in (load can be held up for long by trackers), at most ~2s after
  // the document is parsed; run again on load in case late CSS changed things
  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    start();
  };
  const cssReady = () => [...document.querySelectorAll('link[rel~="stylesheet"]')].every((l) => l.sheet);
  const wait = (since) => {
    if (started) return;
    if (cssReady() || performance.now() - since > 2000) return begin();
    requestAnimationFrame(() => wait(since));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => wait(performance.now()), { once: true });
  else wait(performance.now());
  window.addEventListener('load', () => (started ? all() : begin()), { once: true });
})();`;
}

/** The theme for any page: Primer variables on GitHub, colour mapping everywhere else. */
export function themeScript(theme: Theme): string {
  return `${githubStyleScript(theme)}\n${genericThemeScript(theme)}`;
}
