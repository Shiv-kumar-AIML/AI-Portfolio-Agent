import type { MessageSource } from '@prisma/client';
import prisma from '../lib/prisma';

interface NewMessage {
  name: string;
  email: string;
  message: string;
  source: MessageSource;
  sessionId?: string | null;
}

/**
 * Optional instant notification for a new message. NOTIFY_WEBHOOK_URL may be a Discord or Slack
 * incoming webhook — the payload carries both `content` (Discord) and `text` (Slack). Runs after the
 * message is saved and never throws: a notification failure must not lose or fail the message.
 */
const notify = async (msg: NewMessage) => {
  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) return;
  const text =
    `📬 New portfolio message (${msg.source.toLowerCase()})\n` +
    `From: ${msg.name} <${msg.email}>\n\n${msg.message}`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // allowed_mentions: visitor text must never ping @everyone in a Discord channel
      body: JSON.stringify({ content: text.slice(0, 1900), text, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error('Message notification failed (message was saved):', (error as Error).message);
  }
};

export const createMessage = async (msg: NewMessage) => {
  const saved = await prisma.contactMessage.create({
    data: {
      name: msg.name,
      email: msg.email,
      message: msg.message,
      source: msg.source,
      sessionId: msg.sessionId ?? null,
    },
    select: { id: true, createdAt: true },
  });
  void notify(msg);
  return saved;
};
