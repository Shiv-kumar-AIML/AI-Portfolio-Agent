import prisma from '../lib/prisma';

/**
 * Watches the SSE frames passing through the chat proxy (without changing them) and remembers what
 * the turn did, so it can be logged once the stream ends.
 */
export class SseTap {
  private buffer = '';
  readonly tools: string[] = [];
  answer = '';
  model: string | null = null;
  error: string | null = null;

  push(text: string) {
    this.buffer += text;
    let end: number;
    while ((end = this.buffer.indexOf('\n\n')) !== -1) {
      const event = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      for (const line of event.split('\n')) {
        if (line.startsWith('data: ')) this.onFrame(line.slice(6));
      }
    }
  }

  private onFrame(raw: string) {
    let frame: any;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (frame.type === 'tool_start' && typeof frame.name === 'string') this.tools.push(frame.name);
    else if (frame.type === 'content' && this.answer.length < 1000) this.answer += frame.delta || '';
    else if (frame.type === 'done') this.model = frame.model ?? null;
    else if (frame.type === 'error') this.error = String(frame.message || 'error');
  }
}

interface ChatLogEntry {
  sessionId?: string;
  question: string;
  tap: SseTap;
  latencyMs: number;
  error?: string | null;
}

/** Fire-and-forget: analytics must never break or slow down a chat. */
export const logChatTurn = (entry: ChatLogEntry) => {
  if (!process.env.DATABASE_URL) return;
  prisma.chatLog
    .create({
      data: {
        sessionId: entry.sessionId ?? null,
        question: entry.question.slice(0, 2000),
        answerPreview: entry.tap.answer.slice(0, 1000) || null,
        toolsUsed: [...new Set(entry.tap.tools)],
        model: entry.tap.model,
        latencyMs: entry.latencyMs,
        error: entry.error ?? entry.tap.error,
      },
    })
    .catch((error: Error) => console.error('Chat log write failed:', error.message));
};
