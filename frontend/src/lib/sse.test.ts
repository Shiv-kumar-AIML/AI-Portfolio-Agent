import { describe, expect, it } from 'vitest'
import { createSseParser } from '@/lib/sse'
import type { StreamFrame } from '@/types'

const collect = (chunks: string[]) => {
  const frames: StreamFrame[] = []
  const parser = createSseParser((f) => frames.push(f))
  chunks.forEach((c) => parser.push(c))
  parser.end()
  return frames
}

describe('createSseParser', () => {
  const stream =
    'data: {"type":"content","delta":"Hel"}\n\n' +
    'data: {"type":"content","delta":"lo"}\n\n' +
    'data: {"type":"done"}\n\n'

  it('parses whole events', () => {
    expect(collect([stream]).map((f) => f.type)).toEqual(['content', 'content', 'done'])
  })

  it('handles events split at every possible point', () => {
    for (let size = 1; size < 12; size++) {
      const chunks = stream.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g'))!
      expect(collect(chunks)).toEqual(collect([stream]))
    }
  })

  it('accepts CRLF line endings and a final event without a trailing blank line', () => {
    const frames = collect(['data: {"type":"content","delta":"a"}\r\n\r\n', 'data: {"type":"done"}'])
    expect(frames.map((f) => f.type)).toEqual(['content', 'done'])
  })

  it('skips malformed frames and non-data lines', () => {
    const frames = collect([': keep-alive\n\n', 'data: {broken\n\n', 'event: x\ndata: {"type":"done"}\n\n'])
    expect(frames).toEqual([{ type: 'done' }])
  })
})
