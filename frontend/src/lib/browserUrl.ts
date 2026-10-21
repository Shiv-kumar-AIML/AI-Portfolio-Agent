import type { Socials } from '@/types'

/**
 * Addresses for the mini-OS browser. Web pages run in the live browser (a real Chromium on our
 * server, restyled to the OS theme — see remoteBrowser.ts). The owner's own GitHub and LinkedIn
 * pages also have a simple view drawn from our api (`hasNativePage`), used when the visitor asks
 * for it or the live browser is unavailable. For other pages `pageFor` picks a fallback: GitHub and
 * LinkedIn refuse to be shown inside other sites (X-Frame-Options), so those get an "open in a real
 * tab" page, and anything else is tried in an iframe.
 */

export const NEW_TAB = 'shivos://newtab'

export type Page =
  | { kind: 'newtab' }
  | { kind: 'github-profile' }
  | { kind: 'github-repo'; repo: string }
  | { kind: 'linkedin' }
  | { kind: 'blocked'; host: string }
  | { kind: 'frame' }

// Sites that refuse to be embedded (other than the owner's pages we draw ourselves).
const NO_EMBED = [
  'github.com',
  'linkedin.com',
  'x.com',
  'twitter.com',
  'kaggle.com',
  'huggingface.co',
  'google.com',
  'youtube.com',
  'medium.com',
  'instagram.com',
  'facebook.com',
  'stackoverflow.com',
]

/** What the visitor typed or clicked → an absolute http(s) URL (or NEW_TAB); null if it can't open. */
export function normalizeUrl(input: string, origin = window.location.origin): string | null {
  const raw = input.trim()
  if (!raw || raw === NEW_TAB) return NEW_TAB
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) || raw.startsWith('/') ? raw : `https://${raw}`
  try {
    const url = new URL(withScheme, origin)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

/** Pages the live (server-side) browser shows: any web page except our own site's files. */
export function isLiveUrl(url: string, origin = window.location.origin): boolean {
  if (url === NEW_TAB) return false
  try {
    return new URL(url).origin !== origin
  } catch {
    return false
  }
}

/** The owner's GitHub profile and repos and LinkedIn: they have a simple view in the OS's own UI. */
export function hasNativePage(url: string, socials: Socials | undefined): boolean {
  if (url === NEW_TAB) return false
  try {
    const { kind } = pageFor(url, socials)
    return kind === 'github-profile' || kind === 'github-repo' || kind === 'linkedin'
  } catch {
    return false
  }
}

/** The address bar's short form: no scheme, no trailing slash. */
export function prettyUrl(url: string): string {
  if (url === NEW_TAB) return ''
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname.replace(/\/$/, '')}${u.search}`
  } catch {
    return url
  }
}

const pathOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).pathname.replace(/\/$/, '').toLowerCase() : ''
  } catch {
    return ''
  }
}

export function pageFor(url: string, socials: Socials | undefined): Page {
  if (url === NEW_TAB) return { kind: 'newtab' }
  const u = new URL(url)
  const host = u.hostname.replace(/^www\./, '')
  const parts = u.pathname.split('/').filter(Boolean)
  if (host === 'github.com') {
    const owner = pathOf(socials?.github).split('/')[1]
    if (owner && parts[0]?.toLowerCase() === owner) {
      return parts[1] ? { kind: 'github-repo', repo: parts[1].replace(/\.git$/, '') } : { kind: 'github-profile' }
    }
  }
  if ((host === 'linkedin.com' || host.endsWith('.linkedin.com')) && socials?.linkedin) {
    if (pathOf(url) === pathOf(socials.linkedin)) return { kind: 'linkedin' }
  }
  if (NO_EMBED.some((d) => host === d || host.endsWith(`.${d}`))) return { kind: 'blocked', host }
  return { kind: 'frame' }
}
