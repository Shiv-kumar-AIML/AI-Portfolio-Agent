// The ai-service is internal-only (no nginx route, no published port in production): the api is
// its one caller, authenticated with the shared X-Internal-Service-Key.
export const aiServiceUrl = () => (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

const headers = () => ({
  'Content-Type': 'application/json',
  'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '',
});

export const openChatStream = (
  body: { messages: Array<{ role: string; content: string }>; sessionId?: string },
  signal: AbortSignal
) =>
  fetch(`${aiServiceUrl()}/internal/chat/stream`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ messages: body.messages, session_id: body.sessionId ?? null }),
    signal,
  });

export const callAiService = async (path: '/internal/reindex' | '/internal/search', body: object = {}) => {
  const res = await fetch(`${aiServiceUrl()}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000), // a reindex re-embeds the whole corpus
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};
