import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, streamChat } from '@/lib/api'
import { applyFrame, emptyAssistant, toApiHistory } from '@/lib/chatState'
import { getSessionId, newId, readSession, removeSession, writeSession } from '@/lib/storage'
import type { AssistantMessage, Message } from '@/types'

const STORAGE_KEY = 'portfolio.chat'

export function useChat() {
  const [messages, setMessages] = useState<Message[]>(() =>
    // A reload mid-answer leaves a 'streaming' message behind — show it as stopped.
    readSession<Message[]>(STORAGE_KEY, []).map((m) =>
      m.role === 'assistant' && m.status === 'streaming' ? { ...m, status: 'stopped' } : m
    )
  )
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  // The latest messages for callbacks, without re-creating them on every token.
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    if (!isStreaming) writeSession(STORAGE_KEY, messages)
  }, [messages, isStreaming])

  useEffect(() => () => abortRef.current?.abort(), [])

  const updateAssistant = (id: string, update: (m: AssistantMessage) => AssistantMessage) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id && m.role === 'assistant' ? update(m) : m))
    )
  }

  const send = useCallback(async (text: string) => {
    const question = text.trim()
    if (!question || abortRef.current) return

    const userMessage: Message = { id: newId(), role: 'user', text: question }
    const assistantId = newId()
    const conversation = [...messagesRef.current, userMessage]
    messagesRef.current = [...conversation, emptyAssistant(assistantId)]
    setMessages(messagesRef.current)
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller
    try {
      await streamChat({
        messages: toApiHistory(conversation),
        sessionId: getSessionId(),
        signal: controller.signal,
        onFrame: (frame) => updateAssistant(assistantId, (m) => applyFrame(m, frame)),
      })
      // A stream that ended without `done` or `error` was cut off.
      updateAssistant(assistantId, (m) =>
        m.status !== 'streaming'
          ? m
          : m.text
            ? { ...m, status: 'done' }
            : { ...m, status: 'error', error: 'The answer was cut off. Please try again.' }
      )
    } catch (error) {
      if (controller.signal.aborted) {
        updateAssistant(assistantId, (m) => ({ ...m, status: 'stopped' }))
      } else {
        const message =
          error instanceof ApiError
            ? error.message
            : "I couldn't reach the server. Check your connection and try again."
        updateAssistant(assistantId, (m) => ({ ...m, status: 'error', error: message }))
      }
    } finally {
      abortRef.current = null
      setIsStreaming(false)
    }
  }, [])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  /** Re-ask the last question (after an error or a stop). */
  const retry = useCallback(() => {
    const current = messagesRef.current
    const lastUser = [...current].reverse().find((m) => m.role === 'user')
    if (!lastUser || abortRef.current) return
    const index = current.lastIndexOf(lastUser)
    messagesRef.current = current.slice(0, index)
    setMessages(messagesRef.current)
    void send(lastUser.text)
  }, [send])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    messagesRef.current = []
    setMessages([])
    removeSession(STORAGE_KEY)
  }, [])

  return { messages, isStreaming, send, stop, retry, reset }
}
