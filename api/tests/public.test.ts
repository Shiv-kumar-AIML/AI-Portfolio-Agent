import request from 'supertest';
import { prismaMock, resetPrismaMock } from './helpers';

jest.mock('../src/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

import app from '../src/index';

beforeEach(resetPrismaMock);

describe('health and fallbacks', () => {
  it('GET /health answers ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('unknown routes are JSON 404s', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Not found');
  });

  it('malformed JSON is a 400, not a 500', async () => {
    const res = await request(app)
      .post('/api/contact')
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/profile and /api/projects', () => {
  it('serves the public profile without empty socials or the editor note', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(200);
    expect(res.body.name).toBeTruthy();
    expect(res.body._note).toBeUndefined();
    expect(Object.values(res.body.socials).every(Boolean)).toBe(true);
  });

  it('serves every project with a slug', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((p: { slug: string }) => p.slug)).toBe(true);
  });
});

describe('GET /api/about', () => {
  it('serves bio, experience, education and skills', async () => {
    const res = await request(app).get('/api/about');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['bio', 'education', 'experience', 'skills']);
    expect(Array.isArray(res.body.experience)).toBe(true);
  });
});

describe('POST /api/contact', () => {
  const valid = { name: 'Ana', email: 'ana@example.com', message: 'Would love to chat about a role.' };

  it('saves a valid message as a FORM message', async () => {
    prismaMock.contactMessage.create.mockResolvedValue({ id: 'm1', createdAt: new Date() });
    const res = await request(app).post('/api/contact').send(valid);
    expect(res.status).toBe(201);
    expect(prismaMock.contactMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ...valid, source: 'FORM' }) })
    );
  });

  it('rejects an invalid email with a field message', async () => {
    const res = await request(app).post('/api/contact').send({ ...valid, email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toBe('email');
    expect(prismaMock.contactMessage.create).not.toHaveBeenCalled();
  });

  it('pretends success for bots that fill the honeypot, and stores nothing', async () => {
    const res = await request(app).post('/api/contact').send({ ...valid, website: 'spam.biz' });
    expect(res.status).toBe(201);
    expect(prismaMock.contactMessage.create).not.toHaveBeenCalled();
  });
});
