import { getProfile } from './ContentService';

// Unauthenticated GitHub API calls are limited to 60/hour per IP, so results are cached and a
// failed refresh keeps serving the last good copy. GITHUB_TOKEN (optional) raises the limit.
const CACHE_TTL_MS = Number(process.env.GITHUB_CACHE_TTL_MS) || 60 * 60 * 1000;
const GITHUB_API = 'https://api.github.com';

export interface GithubActivity {
  username: string;
  profileUrl: string;
  avatarUrl: string | null;
  name: string | null;
  bio: string | null;
  publicRepos: number;
  followers: number;
  totalStars: number;
  topLanguages: Array<{ name: string; repos: number }>;
  recentRepos: Array<{
    name: string;
    description: string | null;
    url: string;
    stars: number;
    language: string | null;
    updatedAt: string;
  }>;
  fetchedAt: string;
}

let cache: { username: string; data: GithubActivity; expires: number } | null = null;

export class GithubUnavailableError extends Error {}

const githubFetch = async (path: string) => {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'portfolio-api',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`${GITHUB_API}${path}`, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new GithubUnavailableError(`GitHub responded ${res.status}`);
  return res.json();
};

export const summarize = (username: string, user: any, repos: any[]): GithubActivity => {
  const own = repos.filter((r) => !r.fork && !r.archived);
  const languages = new Map<string, number>();
  for (const repo of own) {
    if (repo.language) languages.set(repo.language, (languages.get(repo.language) || 0) + 1);
  }
  return {
    username,
    profileUrl: user.html_url,
    avatarUrl: user.avatar_url ?? null,
    name: user.name ?? null,
    bio: user.bio ?? null,
    publicRepos: user.public_repos ?? own.length,
    followers: user.followers ?? 0,
    totalStars: own.reduce((sum, r) => sum + (r.stargazers_count || 0), 0),
    topLanguages: [...languages.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, repos: count })),
    recentRepos: [...own]
      .sort((a, b) => Date.parse(b.pushed_at || b.updated_at) - Date.parse(a.pushed_at || a.updated_at))
      .slice(0, 5)
      .map((r) => ({
        name: r.name,
        description: r.description ?? null,
        url: r.html_url,
        stars: r.stargazers_count || 0,
        language: r.language ?? null,
        updatedAt: r.pushed_at || r.updated_at,
      })),
    fetchedAt: new Date().toISOString(),
  };
};

export const getGithubActivity = async (): Promise<GithubActivity> => {
  const username = getProfile().githubUsername;
  if (!username) throw new GithubUnavailableError('No githubUsername in profile.json');
  if (cache && cache.username === username && cache.expires > Date.now()) return cache.data;
  try {
    const name = encodeURIComponent(username);
    const [user, repos] = await Promise.all([
      githubFetch(`/users/${name}`),
      githubFetch(`/users/${name}/repos?per_page=100&sort=pushed`),
    ]);
    const data = summarize(username, user, Array.isArray(repos) ? repos : []);
    cache = { username, data, expires: Date.now() + CACHE_TTL_MS };
    return data;
  } catch (error) {
    if (cache && cache.username === username) return cache.data; // stale beats nothing
    throw error instanceof GithubUnavailableError
      ? error
      : new GithubUnavailableError((error as Error).message);
  }
};

export const resetGithubCache = () => {
  cache = null;
};
