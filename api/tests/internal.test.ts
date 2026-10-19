import request from 'supertest';
import { ADMIN_AUTH, INTERNAL_KEY, jsonResponse, prismaMock, resetPrismaMock } from './helpers';

jest.mock('../src/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

import app from '../src/index';
import { resetGithubCache, summarize } from '../src/services/GithubService';

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
