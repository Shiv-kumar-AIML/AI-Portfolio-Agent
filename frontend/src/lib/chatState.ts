import type { AssistantMessage, Message, StreamFrame } from '@/types'

export const emptyAssistant = (id: string): AssistantMessage => ({
  id,
  role: 'assistant',
  text: '',
  steps: [],
  cards: [],
  sources: [],
  suggestions: [],
  status: 'streaming',
})

/** Apply one streamed frame to the assistant message being written. Pure — easy to test. */
export function applyFrame(msg: AssistantMessage, frame: StreamFrame): AssistantMessage {
  switch (frame.type) {
    case 'tool_start':
      return {
        ...msg,
        steps: [...msg.steps, { id: frame.id, name: frame.name, label: frame.label, status: 'running' }],
      }
    case 'tool_end':
      return {
        ...msg,
        steps: msg.steps.map((s) =>
          s.id === frame.id ? { ...s, status: frame.ok ? 'done' : 'error' } : s
        ),
      }
    case 'tool_result':
      return { ...msg, cards: [...msg.cards, { id: frame.id, card: frame.card, data: frame.data }] }
    case 'content':
      return { ...msg, text: msg.text + frame.delta }
    case 'sources':
      return { ...msg, sources: frame.sources }
    case 'suggestions':
      return { ...msg, suggestions: frame.items }
    case 'done':
      return { ...msg, status: 'done' }
    case 'error':
      return { ...msg, status: 'error', error: frame.message }
    default:
      return msg
  }
}

const MAX_HISTORY = 20

/**
 * The conversation as the API expects it: text only. Cards are not resent, but a short note says
 * which ones the visitor already saw, so the model doesn't re-show them unasked.
 */
export function toApiHistory(messages: Message[]) {
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const m of messages) {
    if (m.role === 'user') {
      history.push({ role: 'user', content: m.text })
      continue
    }
    const shown = m.cards.length ? `\n\n[Shown to the visitor: ${m.cards.map((c) => c.card).join(', ')} card]` : ''
    const content = (m.text.trim() + shown).trim()
    if (content) history.push({ role: 'assistant', content: content.slice(0, 4000) })
  }
  // The API requires the conversation to start with — and end on — a user message.
  const trimmed = history.slice(-MAX_HISTORY)
  while (trimmed.length && trimmed[0].role !== 'user') trimmed.shift()
  return trimmed
}
