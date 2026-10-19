import { Router } from 'express';
import { chatBurstLimiter, chatDailyLimiter } from '../middleware/rateLimiters';
import { openChatStream } from '../services/AiServiceClient';
import { logChatTurn, SseTap } from '../services/ChatLogService';
import { chatRequestSchema, validationError } from '../utils/validation';

const router = Router();

/**
 * @openapi
 * /api/chat:
 *   post:
 *     tags: [Public]
 *     summary: Ask the portfolio agent; the answer streams back as Server-Sent Events
 *     description: |
 *       Stateless — the client sends the conversation so far (text only). Each SSE `data:` line is a
 *       JSON frame: `tool_start`, `tool_result` (a UI card), `tool_end`, `content` (text delta),
 *       `sources`, `suggestions`, `done` or `error`. See ai-service/docs/STREAM_CONTRACT.md.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messages]
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: Random id the browser keeps per visit (8-64 URL-safe chars)
 *               messages:
 *                 type: array
 *                 maxItems: 30
 *                 items:
 *                   type: object
 *                   required: [role, content]
 *                   properties:
 *                     role: { type: string, enum: [user, assistant] }
 *                     content: { type: string, maxLength: 4000 }
 *     responses:
 *       200:
 *         description: text/event-stream of agent frames
 *       400:
 *         description: Invalid request (e.g. last message not from the user, too long)
 *       429:
 *         description: Rate limited
 *       502:
 *         description: The AI service is unreachable
 *       503:
 *         description: The AI service is starting or has no LLM key configured
 */
router.post('/', chatBurstLimiter, chatDailyLimiter, async (req, res) => {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(validationError(parsed.error));
  const body = parsed.data;
  const question = body.messages[body.messages.length - 1].content;
  const started = Date.now();

  // Stop the LLM work when the visitor closes the tab mid-answer.
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) abort.abort();
  });

  let upstream: Response;
  try {
    upstream = await openChatStream(body, abort.signal);
  } catch (error) {
    console.error('ai-service unreachable:', (error as Error).message);
    logChatTurn({
      sessionId: body.sessionId,
      question,
      tap: new SseTap(),
      latencyMs: Date.now() - started,
      error: 'ai-service unreachable',
    });
    return res
      .status(502)
      .json({ message: 'The assistant is offline right now. Please try again shortly.' });
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    console.error(`ai-service returned ${upstream.status}:`, detail.slice(0, 300));
    const status = upstream.status === 503 ? 503 : 502;
    // A missing LLM key is a setup problem, not a warm-up — say so instead of "try again".
    const notConfigured = detail.includes('API_KEY');
    return res.status(status).json({
      message: notConfigured
        ? "The assistant isn't configured yet (no LLM API key on the server)."
        : status === 503
          ? 'The assistant is warming up — please try again in a few seconds.'
          : 'The assistant could not answer right now.',
    });
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  const tap = new SseTap();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  let streamError: string | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
      tap.push(decoder.decode(value, { stream: true }));
    }
  } catch (error) {
    if (abort.signal.aborted) {
      streamError = 'client disconnected';
    } else {
      streamError = 'stream interrupted';
      console.error('Chat stream interrupted:', (error as Error).message);
      const frame = { type: 'error', message: 'The answer was interrupted. Please try again.' };
      res.write(`data: ${JSON.stringify(frame)}\n\n`);
    }
  } finally {
    res.end();
    logChatTurn({
      sessionId: body.sessionId,
      question,
      tap,
      latencyMs: Date.now() - started,
      error: streamError,
    });
  }
});

export default router;
