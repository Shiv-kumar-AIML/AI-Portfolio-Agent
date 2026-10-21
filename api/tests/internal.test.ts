import request from 'supertest';
import { ADMIN_AUTH, INTERNAL_KEY, jsonResponse, prismaMock, resetPrismaMock } from './helpers';

jest.mock('../src/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

import app from '../src/index';
import { listRepoFiles, resetGithubCache, summarize, summarizeLanguages } from '../src/services/GithubService';

const fetchMock = jest.fn();
const realFetch = global.fetch;

beforeEach(() => {
  resetPrismaMock();
  resetGithubCache();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = realFetch;
});

const githubUser = { html_url: 'https://github.com/octocat', public_repos: 3, followers: 9, name: 'Octo' };
const githubRepos = [
  { name: 'a', html_url: 'u/a', stargazers_count: 5, language: 'Python', pushed_at: '2026-01-02T00:00:00Z' },
  { name: 'b', html_url: 'u/b', stargazers_count: 2, language: 'Python', pushed_at: '2026-03-01T00:00:00Z' },
  { name: 'c', html_url: 'u/c', stargazers_count: 1, language: 'TypeScript', pushed_at: '2025-01-01T00:00:00Z' },
  { name: 'forked', html_url: 'u/f', stargazers_count: 999, language: 'C', fork: true, pushed_at: '2026-05-01T00:00:00Z' },
];

describe('/internal/* (ai-service only)', () => {
  it('rejects calls without the internal service key', async () => {
    expect((await request(app).get('/internal/github')).status).toBe(401);
    const wrong = await request(app).post('/internal/messages').set('X-Internal-Service-Key', 'nope').send({});
    expect(wrong.status).toBe(401);
  });

  it('saves an agent-sent message with its session', async () => {
    prismaMock.contactMessage.create.mockResolvedValue({ id: 'm1', createdAt: new Date() });
    const res = await request(app)
      .post('/internal/messages')
      .set(INTERNAL_KEY)
      .send({ name: 'Ana', email: 'ana@example.com', message: 'Hello from the agent', sessionId: 'abc' });
    expect(res.status).toBe(201);
    expect(prismaMock.contactMessage.create.mock.calls[0][0].data).toMatchObject({
      source: 'AGENT',
      sessionId: 'abc',
    });
  });

  it('validates agent-sent messages too', async () => {
    const res = await request(app)
      .post('/internal/messages')
      .set(INTERNAL_KEY)
      .send({ name: 'Ana', email: 'invented', message: 'Hello from the agent' });
    expect(res.status).toBe(400);
  });

  it('serves GitHub stats and caches them', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      jsonResponse(url.includes('/repos') ? githubRepos : githubUser)
    );
    const first = await request(app).get('/internal/github').set(INTERNAL_KEY);
    const second = await request(app).get('/api/github');
    expect(first.status).toBe(200);
    expect(second.body.totalStars).toBe(8);
    expect(fetchMock).toHaveBeenCalledTimes(2); // user + repos, once — second hit was cached
  });

  it('answers 503 when GitHub fails and nothing is cached', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'rate limited' }, 403));
    const res = await request(app).get('/internal/github').set(INTERNAL_KEY);
    expect(res.status).toBe(503);
  });
});

describe('GitHub summary', () => {
  it('ignores forks, ranks languages and orders repos by last push', () => {
    const s = summarize('octocat', githubUser, githubRepos);
    expect(s.totalStars).toBe(8);
    expect(s.topLanguages).toEqual([
      { name: 'Python', repos: 2 },
      { name: 'TypeScript', repos: 1 },
    ]);
    expect(s.recentRepos.map((r) => r.name)).toEqual(['b', 'a', 'c']);
  });
});

describe('GET /internal/github/repos/:name', () => {
  const repoDetail = {
    name: 'a',
    html_url: 'u/a',
    description: 'Repo A',
    homepage: '',
    topics: ['rag'],
    stargazers_count: 5,
    forks_count: 1,
    default_branch: 'main',
    created_at: '2025-01-01T00:00:00Z',
    pushed_at: '2026-01-02T00:00:00Z',
  };
  const routeGithub = (url: string) => {
    if (url.endsWith('/users/octocat')) return jsonResponse(githubUser);
    if (url.includes('/users/octocat/repos')) return jsonResponse(githubRepos);
    if (url.endsWith('/repos/octocat/a')) return jsonResponse(repoDetail);
    if (url.endsWith('/languages')) return jsonResponse({ Python: 750, Shell: 250 });
    if (url.endsWith('/readme')) return new Response('# Repo A\nHybrid RAG.', { status: 200 });
    if (url.includes('/git/trees/main')) {
      return jsonResponse({
        tree: [
          { path: 'app/main.py', type: 'blob' },
          { path: 'README.md', type: 'blob' },
          { path: 'node_modules/x/index.js', type: 'blob' },
          { path: 'app', type: 'tree' },
        ],
      });
    }
    return jsonResponse({ message: 'not found' }, 404);
  };

  it('needs the internal service key', async () => {
    expect((await request(app).get('/internal/github/repos/a')).status).toBe(401);
  });

  it('returns README, languages and files for an own repo (name matched case-insensitively)', async () => {
    fetchMock.mockImplementation(async (url: string) => routeGithub(url));
    const res = await request(app).get('/internal/github/repos/A').set(INTERNAL_KEY);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'a',
      readme: '# Repo A\nHybrid RAG.',
      languages: [
        { name: 'Python', percent: 75 },
        { name: 'Shell', percent: 25 },
      ],
      files: ['README.md', 'app/main.py'],
      totalFiles: 2,
    });
  });

  it('404s with the list of real repos for an unknown or forked repo', async () => {
    fetchMock.mockImplementation(async (url: string) => routeGithub(url));
    const res = await request(app).get('/internal/github/repos/forked').set(INTERNAL_KEY);
    expect(res.status).toBe(404);
    expect(res.body.available).toEqual(['a', 'b', 'c']);
  });

  it('is also served publicly (for the mini-OS browser), without the list of other repos', async () => {
    fetchMock.mockImplementation(async (url: string) => routeGithub(url));
    const ok = await request(app).get('/api/github/repos/a');
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ name: 'a', readme: '# Repo A\nHybrid RAG.' });
    const missing = await request(app).get('/api/github/repos/forked');
    expect(missing.status).toBe(404);
    expect(missing.body.available).toBeUndefined();
    expect((await request(app).get('/api/github/repos/a%2F..%2Fsecrets')).status).toBe(400);
  });

  it('rejects names that are not valid repo names', async () => {
    const res = await request(app).get('/internal/github/repos/a%2F..%2Fsecrets').set(INTERNAL_KEY);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('repo helpers', () => {
  it('drops noise paths and lists shallow files first', () => {
    const { files, totalFiles } = listRepoFiles([
      { path: 'src/deep/a.ts', type: 'blob' },
      { path: '__pycache__/x.pyc', type: 'blob' },
      { path: 'package.json', type: 'blob' },
    ]);
    expect(files).toEqual(['package.json', 'src/deep/a.ts']);
    expect(totalFiles).toBe(2);
  });

  it('turns language bytes into percentages', () => {
    expect(summarizeLanguages({ TypeScript: 1, CSS: 3 })).toEqual([
      { name: 'CSS', percent: 75 },
      { name: 'TypeScript', percent: 25 },
    ]);
  });
});

describe('/api/admin/*', () => {
  it('requires the admin bearer token', async () => {
    expect((await request(app).get('/api/admin/messages')).status).toBe(401);
    const wrong = await request(app).get('/api/admin/messages').set('Authorization', 'Bearer nope');
    expect(wrong.status).toBe(401);
  });

  it('lists messages filtered by status', async () => {
    prismaMock.contactMessage.findMany.mockResolvedValue([{ id: 'm1' }]);
    const res = await request(app).get('/api/admin/messages?status=NEW&limit=10').set(ADMIN_AUTH);
    expect(res.status).toBe(200);
    expect(prismaMock.contactMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'NEW' }, take: 10 })
    );
  });

  it('404s when updating a message that does not exist', async () => {
    prismaMock.contactMessage.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app)
      .patch('/api/admin/messages/3f1c2a5e-8b7d-4c3a-9e2f-1a2b3c4d5e6f')
      .set(ADMIN_AUTH)
      .send({ status: 'READ' });
    expect(res.status).toBe(404);
  });

  it('rejects a non-uuid message id', async () => {
    const res = await request(app).patch('/api/admin/messages/abc').set(ADMIN_AUTH).send({ status: 'READ' });
    expect(res.status).toBe(400);
  });

  it('forwards reindex to the ai-service with the internal key', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ready: true, chunks: 48 }));
    const res = await request(app).post('/api/admin/reindex').set(ADMIN_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.chunks).toBe(48);
    expect(fetchMock.mock.calls[0][1].headers['X-Internal-Service-Key']).toBe(INTERNAL_KEY['X-Internal-Service-Key']);
  });

  it('does not exist at all when ADMIN_TOKEN is unset', async () => {
    const saved = process.env.ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    try {
      const res = await request(app).get('/api/admin/stats').set(ADMIN_AUTH);
      expect(res.status).toBe(404);
    } finally {
      process.env.ADMIN_TOKEN = saved;
    }
  });
});
