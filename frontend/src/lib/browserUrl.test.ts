import { describe, expect, it } from 'vitest'
import { hasNativePage, NEW_TAB, normalizeUrl, pageFor, prettyUrl } from '@/lib/browserUrl'

const socials = { github: 'https://github.com/Octo-Cat', linkedin: 'https://www.linkedin.com/in/octo/' }
const origin = 'http://localhost:5173'

describe('normalizeUrl', () => {
  it('adds https to bare hosts and resolves site paths', () => {
    expect(normalizeUrl('github.com/octo-cat', origin)).toBe('https://github.com/octo-cat')
    expect(normalizeUrl('/resume.pdf', origin)).toBe('http://localhost:5173/resume.pdf')
    expect(normalizeUrl('  ', origin)).toBe(NEW_TAB)
  })

  it('refuses anything that is not http(s)', () => {
    expect(normalizeUrl('javascript:alert(1)', origin)).toBeNull()
    expect(normalizeUrl('data:text/html,hi', origin)).toBeNull()
  })
})

describe('pageFor', () => {
  it("draws the owner's GitHub and LinkedIn pages natively", () => {
    expect(pageFor('https://github.com/octo-cat', socials)).toEqual({ kind: 'github-profile' })
    expect(pageFor('https://github.com/Octo-Cat/rag.git', socials)).toEqual({ kind: 'github-repo', repo: 'rag' })
    expect(pageFor('https://github.com/octo-cat/rag/tree/main/src', socials)).toEqual({ kind: 'github-repo', repo: 'rag' })
    expect(pageFor('https://linkedin.com/in/octo', socials)).toEqual({ kind: 'linkedin' })
  })

  it("sends other people's pages on embed-refusing sites to a real tab, and frames the rest", () => {
    expect(pageFor('https://github.com/someone/rag', socials)).toEqual({ kind: 'blocked', host: 'github.com' })
    expect(pageFor('https://www.linkedin.com/in/someone', socials)).toEqual({ kind: 'blocked', host: 'linkedin.com' })
    expect(pageFor('https://demo.example.com/', socials)).toEqual({ kind: 'frame' })
    expect(pageFor(NEW_TAB, socials)).toEqual({ kind: 'newtab' })
  })
})

describe('prettyUrl', () => {
  it('drops the scheme and trailing slash', () => {
    expect(prettyUrl('https://github.com/octo-cat/')).toBe('github.com/octo-cat')
    expect(prettyUrl(NEW_TAB)).toBe('')
  })
})

describe('hasNativePage', () => {
  it("is true only for the owner's GitHub and LinkedIn pages", () => {
    expect(hasNativePage('https://github.com/octo-cat/rag', socials)).toBe(true)
    expect(hasNativePage('https://www.linkedin.com/in/octo', socials)).toBe(true)
    expect(hasNativePage('https://github.com/someone/rag', socials)).toBe(false)
    expect(hasNativePage(NEW_TAB, socials)).toBe(false)
  })
})
