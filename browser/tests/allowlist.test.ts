import { describe, expect, it } from 'vitest';
import { hostsFromProfile, isAllowed, isPrivateHost } from '../src/allowlist';

const profile = {
  socials: { github: 'https://github.com/octo', linkedin: 'https://www.linkedin.com/in/octo', x: '' },
  projects: [{ links: { github: 'https://github.com/octo/rag', demo: 'https://rag-demo.vercel.app/' } }],
};

describe('allowlist', () => {
  const hosts = hostsFromProfile(profile, ['docs.example.com']);

  it('allows GitHub, LinkedIn, the profile link hosts and extra hosts (with subdomains)', () => {
    expect(isAllowed('https://github.com/octo/rag', hosts)).toBe(true);
    expect(isAllowed('https://gist.github.com/octo', hosts)).toBe(true);
    expect(isAllowed('https://www.linkedin.com/in/octo', hosts)).toBe(true);
    expect(isAllowed('https://rag-demo.vercel.app/chat', hosts)).toBe(true);
    expect(isAllowed('https://docs.example.com/', hosts)).toBe(true);
  });

  it('refuses every other host, look-alikes and non-web schemes', () => {
    expect(isAllowed('https://example.com/', hosts)).toBe(false);
    expect(isAllowed('https://other.vercel.app/', hosts)).toBe(false);
    expect(isAllowed('https://evilgithub.com/', hosts)).toBe(false);
    expect(isAllowed('https://github.com.evil.io/', hosts)).toBe(false);
    expect(isAllowed('file:///etc/passwd', hosts)).toBe(false);
    expect(isAllowed('http://localhost:5010/internal/github', hosts)).toBe(false);
    expect(isAllowed('not a url', hosts)).toBe(false);
  });
});

describe('isPrivateHost', () => {
  it('flags our own network', () => {
    for (const host of ['localhost', 'api', 'postgres', '127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.1', '169.254.169.254', '[::1]', 'fd00::1', 'printer.local']) {
      expect(isPrivateHost(host), host).toBe(true);
    }
  });

  it('lets public hosts through', () => {
    for (const host of ['github.com', 'avatars.githubusercontent.com', '140.82.112.3', '172.32.0.1']) {
      expect(isPrivateHost(host), host).toBe(false);
    }
  });
});
