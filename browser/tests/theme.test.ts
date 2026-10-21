import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/protocol';
import { githubCss, githubStyleScript } from '../src/theme';

const colors = {
  background: '#f6eee2',
  foreground: '#2b1d15',
  card: '#fffaf3',
  muted: '#efe3d3',
  mutedForeground: '#7a6555',
  border: '#e2d2bf',
  primary: '#2f7f86',
  primaryForeground: '#fffaf3',
  wood: '#d9874c',
  edge: '#3a2a22',
};

describe('theme', () => {
  it('accepts hex colours only, so nothing but a colour reaches the CSS', () => {
    const ok = parseClientMessage(JSON.stringify({ t: 'theme', theme: { mode: 'dark', colors } }));
    expect(ok).toMatchObject({ t: 'theme' });
    const evil = { ...colors, primary: 'red; } body { display: none' };
    expect(parseClientMessage(JSON.stringify({ t: 'theme', theme: { mode: 'dark', colors: evil } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'theme', theme: { mode: 'sepia', colors } }))).toBeNull();
  });

  it("maps the palette onto GitHub's Primer variables", () => {
    const css = githubCss({ mode: 'light', colors });
    expect(css).toContain('--bgColor-default: #f6eee2 !important;');
    expect(css).toContain('--fgColor-accent: #2f7f86 !important;');
    expect(css).toContain('--MarketingHeader-canvas-default: #d9874c !important;');
  });

  it('only styles GitHub pages, and waits for the document', () => {
    const script = githubStyleScript({ mode: 'light', colors });
    expect(script).toContain('github\\.com');
    expect(script).toContain("addEventListener('readystatechange', put)");
  });
});

describe('themeScript', () => {
  it('is valid JavaScript (it runs inside every page)', async () => {
    const { themeScript } = await import('../src/theme');
    expect(() => new Function(themeScript({ mode: 'dark', colors }))).not.toThrow();
  });
});
