import fs from 'fs';
import path from 'path';
import { config, contentDir } from './config';

/**
 * Where the remote browser may go. It runs on our server, so it must not become an open proxy:
 * top-level pages are limited to GitHub, LinkedIn, the hosts of the owner's own links in
 * profile.json, and BROWSER_EXTRA_HOSTS. (Images, scripts and other subresources load from anywhere.)
 */

const ALWAYS = ['github.com', 'linkedin.com','youtube.com'];

type Profile = {
  socials?: Record<string, string>;
  resumeUrl?: string;
  projects?: Array<{ links?: Record<string, string> }>;
};

const hostOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};

export function hostsFromProfile(profile: Profile, extra: string[] = []): string[] {
  const links = [
    ...Object.values(profile.socials || {}),
    ...(profile.projects || []).flatMap((p) => Object.values(p.links || {})),
  ];
  return [...new Set([...ALWAYS, ...links.map(hostOf), ...extra].filter(Boolean))];
}

export function isAllowed(url: string, hosts: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.href === 'about:blank') return true;
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname.toLowerCase();
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * Hosts on our own network: localhost, private/link-local IPs and single-label names (Docker service
 * names like `api`). No request — not even an image — may reach them from the remote browser.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host.includes(':')) return host === '::' || host === '::1' || /^(fc|fd|fe80)/.test(host) || host.startsWith('::ffff:');
  const ip = host.split('.').map(Number);
  if (ip.length === 4 && ip.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a, b] = ip;
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return !host.includes('.');
}

let cached: { hosts: string[]; mtimeMs: number } | null = null;

/** The allowed hosts, re-read whenever profile.json changes. */
export function allowedHosts(): string[] {
  const file = path.join(contentDir(), 'profile.json');
  try {
    const { mtimeMs } = fs.statSync(file);
    if (!cached || cached.mtimeMs !== mtimeMs) {
      cached = { hosts: hostsFromProfile(JSON.parse(fs.readFileSync(file, 'utf8')), config.extraHosts), mtimeMs };
    }
    return cached.hosts;
  } catch {
    return cached?.hosts ?? [...ALWAYS, ...config.extraHosts];
  }
}
