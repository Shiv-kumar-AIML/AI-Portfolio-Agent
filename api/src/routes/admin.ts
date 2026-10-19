import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAdmin } from '../middleware/auth';
import { callAiService } from '../services/AiServiceClient';
import { messageStatusSchema, validationError } from '../utils/validation';

// The owner's tools: inbox, chat analytics, and RAG maintenance. Bearer ADMIN_TOKEN.
const router = Router();
router.use(requireAdmin);

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(['NEW', 'READ', 'ARCHIVED']).optional(),
});

const searchBody = z.object({
  query: z.string().trim().min(1).max(300),
  top_k: z.number().int().min(1).max(20).optional(),
});

router.get('/messages', async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json(validationError(parsed.error));
  const { limit, status } = parsed.data;
  const messages = await prisma.contactMessage.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json(messages);
});

router.patch('/messages/:id', async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  const body = messageStatusSchema.safeParse(req.body);
  if (!id.success) return res.status(400).json({ message: 'Invalid message id' });
  if (!body.success) return res.status(400).json(validationError(body.error));
  const updated = await prisma.contactMessage.updateMany({
    where: { id: id.data },
    data: body.data,
  });
  if (updated.count === 0) return res.status(404).json({ message: 'Message not found' });
  res.json({ id: id.data, ...body.data });
});

router.get('/chat-logs', async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json(validationError(parsed.error));
  res.json(
    await prisma.chatLog.findMany({ orderBy: { createdAt: 'desc' }, take: parsed.data.limit })
  );
});

// Counts are aggregate queries — nothing is loaded into Node to be counted.
router.get('/stats', async (_req, res) => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = { createdAt: { gte: weekAgo } };
  const [chats, chatsThisWeek, sessions, failedThisWeek, newMessages, latency] = await Promise.all([
    prisma.chatLog.count(),
    prisma.chatLog.count({ where: thisWeek }),
    prisma.chatLog.groupBy({ by: ['sessionId'], where: thisWeek }),
    prisma.chatLog.count({ where: { ...thisWeek, error: { not: null } } }),
    prisma.contactMessage.count({ where: { status: 'NEW' } }),
    prisma.chatLog.aggregate({ _avg: { latencyMs: true }, where: thisWeek }),
  ]);
  res.json({
    chats,
    chatsThisWeek,
    visitorsThisWeek: sessions.length,
    failedThisWeek,
    newMessages,
    avgLatencyMsThisWeek: Math.round(latency._avg.latencyMs || 0),
  });
});

/** Rebuild the ai-service's index after editing content/ (profile.json or knowledge/*.md). */
router.post('/reindex', async (_req, res) => {
  const { status, data } = await callAiService('/internal/reindex');
  res.status(status).json(data);
});

/** Inspect raw hybrid-retrieval results (BM25 rank, dense rank, fused score) for a query. */
router.post('/search', async (req, res) => {
  const body = searchBody.safeParse(req.body);
  if (!body.success) return res.status(400).json(validationError(body.error));
  const { status, data } = await callAiService('/internal/search', body.data);
  res.status(status).json(data);
});

export default router;
