import { describe, expect, it } from 'vitest'
import { applyFrame, emptyAssistant, toApiHistory } from '@/lib/chatState'
import type { AssistantMessage, Message, StreamFrame } from '@/types'

const run = (frames: StreamFrame[]) => frames.reduce(applyFrame, emptyAssistant('a1'))

describe('applyFrame', () => {
  it('builds a full turn: steps, card, text, sources, suggestions', () => {
    const msg = run([
      { type: 'tool_start', id: 't1', name: 'get_projects', label: 'Loading my projects…' },
      { type: 'tool_result', id: 't1', name: 'get_projects', card: 'projects', data: { projects: [] } },
      { type: 'tool_end', id: 't1', name: 'get_projects', ok: true },
      { type: 'content', delta: 'Here ' },
      { type: 'content', delta: 'they are.' },
      { type: 'sources', sources: [{ id: 's', title: 'T', section: '', snippet: 'x' }] },
      { type: 'suggestions', items: ['More?'] },
      { type: 'done' },
    ])
    expect(msg.steps).toEqual([{ id: 't1', name: 'get_projects', label: 'Loading my projects…', status: 'done' }])
    expect(msg.cards).toHaveLength(1)
    expect(msg.text).toBe('Here they are.')
    expect(msg.sources).toHaveLength(1)
    expect(msg.suggestions).toEqual(['More?'])
    expect(msg.status).toBe('done')
  })

  it('marks failed tools and stream errors', () => {
    const msg = run([
      { type: 'tool_start', id: 't1', name: 'get_github_activity', label: '…' },
      { type: 'tool_end', id: 't1', name: 'get_github_activity', ok: false },
      { type: 'error', message: 'Rate limited' },
    ])
    expect(msg.steps[0].status).toBe('error')
    expect(msg).toMatchObject({ status: 'error', error: 'Rate limited' })
  })
})

describe('toApiHistory', () => {
  const assistant = (over: Partial<AssistantMessage>): AssistantMessage => ({ ...emptyAssistant('x'), status: 'done', ...over })

  it('sends text only, noting which cards were shown, and drops empty assistant turns', () => {
    const messages: Message[] = [
      { id: '1', role: 'user', text: 'projects?' },
      assistant({ text: 'Here.', cards: [{ id: 'c', card: 'projects', data: {} }] }),
      { id: '2', role: 'user', text: 'hello' },
      assistant({ text: '', status: 'error' }),
      { id: '3', role: 'user', text: 'again' },
    ]
    expect(toApiHistory(messages)).toEqual([
      { role: 'user', content: 'projects?' },
      { role: 'assistant', content: 'Here.\n\n[Shown to the visitor: projects card]' },
      { role: 'user', content: 'hello' },
      { role: 'user', content: 'again' },
    ])
  })

  it('keeps the window bounded and starting with a user message', () => {
    const long: Message[] = []
    for (let i = 0; i < 30; i++) {
      long.push({ id: `u${i}`, role: 'user', text: `q${i}` }, assistant({ id: `a${i}`, text: `a${i}` }))
    }
    long.push({ id: 'last', role: 'user', text: 'final' })
    const history = toApiHistory(long)
    expect(history.length).toBeLessThanOrEqual(20)
    expect(history[0].role).toBe('user')
    expect(history.at(-1)).toEqual({ role: 'user', content: 'final' })
  })
})
