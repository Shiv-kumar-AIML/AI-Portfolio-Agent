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
  /** Every own (non-fork, non-archived) repo, compact — lets the agent pick one to read in depth. */
  allRepos: Array<{ name: string; description: string | null; language: string | null }>;
  fetchedAt: string;
}

export interface RepoDetails {
  name: string;
  url: string;
  description: string | null;
  homepage: string | null;
  topics: string[];
  stars: number;
  forks: number;
  defaultBranch: string;
  createdAt: string;
  pushedAt: string;
  languages: Array<{ name: string; percent: number }>;
  readme: string | null;
  readmeTruncated: boolean;
  files: string[];
  totalFiles: number;
  fetchedAt: string;
}

let cache: { username: string; data: GithubActivity; expires: number } | null = null;

export class GithubUnavailableError extends Error {}
export class RepoNotFoundError extends Error {
  constructor(
    message: string,
    readonly available: string[]
  ) {
    super(message);
  }
}

const githubRequest = async (path: string, accept = 'application/vnd.github+json') => {
  const headers: Record<string, string> = { Accept: accept, 'User-Agent': 'portfolio-api' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return fetch(`${GITHUB_API}${path}`, { headers, signal: AbortSignal.timeout(8000) });
};

const githubFetch = async (path: string) => {
  const res = await githubRequest(path);
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
    allRepos: own.map((r) => ({
      name: r.name,
      description: r.description ?? null,
      language: r.language ?? null,
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

// ---- One repository in depth (README, files, languages) ----

const README_MAX_CHARS = 3500;
const MAX_FILES = 80;
// Paths that say nothing about the project and would crowd out the ones that do.
const NOISE_PATH = /(^|\/)(node_modules|\.git|__pycache__|\.ipynb_checkpoints|dist|build|\.venv|venv|\.next|coverage)(\/|$)/;

const repoCache = new Map<string, { data: RepoDetails; expires: number }>();

export const summarizeLanguages = (bytes: Record<string, number>) => {
  const total = Object.values(bytes).reduce((sum, n) => sum + n, 0) || 1;
  return Object.entries(bytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, n]) => ({ name, percent: Math.round((n / total) * 1000) / 10 }));
};

export const listRepoFiles = (tree: Array<{ path: string; type: string }>) => {
  const files = tree.filter((e) => e.type === 'blob' && !NOISE_PATH.test(e.path)).map((e) => e.path);
  // Shallow paths first: the top of the tree says the most about how a project is organised.
  files.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  return { files: files.slice(0, MAX_FILES), totalFiles: files.length };
};

/**
 * Details of one of the owner's own repositories. Only repos listed for the profile's GitHub user
 * can be read — the name is matched against that list, never passed through as-is.
 */
export const getRepoDetails = async (requested: string): Promise<RepoDetails> => {
  const activity = await getGithubActivity();
  const match = activity.allRepos.find((r) => r.name.toLowerCase() === requested.toLowerCase());
  if (!match) {
    throw new RepoNotFoundError(
      `No public repo named '${requested}'`,
      activity.allRepos.map((r) => r.name)
    );
  }
  const key = `${activity.username}/${match.name}`;
  const hit = repoCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;

  try {
    const base = `/repos/${encodeURIComponent(activity.username)}/${encodeURIComponent(match.name)}`;
    const repo = await githubFetch(base);
    const [languages, readmeRes, tree] = await Promise.all([
      githubFetch(`${base}/languages`).catch(() => ({})),
      githubRequest(`${base}/readme`, 'application/vnd.github.raw'),
      githubFetch(`${base}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`).catch(() => ({
        tree: [],
      })),
    ]);
    const readme = readmeRes.ok ? (await readmeRes.text()).trim() : null;
    const { files, totalFiles } = listRepoFiles(Array.isArray(tree.tree) ? tree.tree : []);
    const data: RepoDetails = {
      name: repo.name,
      url: repo.html_url,
      description: repo.description ?? null,
      homepage: repo.homepage || null,
      topics: repo.topics ?? [],
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      defaultBranch: repo.default_branch,
      createdAt: repo.created_at,
      pushedAt: repo.pushed_at,
      languages: summarizeLanguages(languages || {}),
      readme: readme ? readme.slice(0, README_MAX_CHARS) : null,
      readmeTruncated: !!readme && readme.length > README_MAX_CHARS,
      files,
      totalFiles,
      fetchedAt: new Date().toISOString(),
    };
    repoCache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (error) {
    if (hit) return hit.data; // stale beats nothing
    throw error instanceof GithubUnavailableError
      ? error
      : new GithubUnavailableError((error as Error).message);
  }
};

export const resetGithubCache = () => {
  cache = null;
  repoCache.clear();
};
