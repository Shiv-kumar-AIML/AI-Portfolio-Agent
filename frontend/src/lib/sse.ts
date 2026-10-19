import type { StreamFrame } from '@/types'

/**
 * Incremental Server-Sent Events parser. Network chunks split events anywhere — mid-line or even
 * mid-UTF-8 character (the decoder handles that) — so text is buffered until a blank line ends an
 * event. Only `data:` lines are used; each holds one JSON frame.
 */
export function createSseParser(onFrame: (frame: StreamFrame) => void) {
  let buffer = ''

  const flushEvent = (event: string) => {
    const data = event
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (!data) return
    try {
      onFrame(JSON.parse(data) as StreamFrame)
    } catch {
      // A malformed frame is skipped rather than ending the whole answer.
    }
  }

  return {
    push(text: string) {
      buffer += text.replace(/\r\n/g, '\n')
      let end: number
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        flushEvent(buffer.slice(0, end))
        buffer = buffer.slice(end + 2)
      }
    },
    end() {
      if (buffer.trim()) flushEvent(buffer)
      buffer = ''
    },
  }
}
