import { ArrowDown, ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Message } from '@/types'
import { ChatInput } from './ChatInput'
import { AssistantMessageView, UserMessageView } from './MessageViews'
import { QuickActions } from './QuickActions'

/**
 * The conversation scrolls inside its own panel (not the window), and that panel fades out at its
 * top and bottom edges with a CSS mask. A mask only hides the messages — never the fluid background
 * behind them — so the top bar and the input bar need no background and the colour runs edge to
 * edge without a hard line.
 */
export function ChatView({
  messages,
  busy,
  onSend,
  onStop,
  onRetry,
}: {
  messages: Message[]
  busy: boolean
  onSend: (text: string) => void
  onStop: () => void
  onRetry: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Follow the answer as it streams — unless the visitor scrolled up to read something.
  const [pinned, setPinned] = useState(true)
  const [showQuick, setShowQuick] = useState(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setPinned(el.scrollHeight - el.clientHeight - el.scrollTop < 120)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (pinned && el) el.scrollTop = el.scrollHeight
  }, [messages, pinned, showQuick])

  const send = (text: string) => {
    setPinned(true)
    onSend(text)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pt-6 pb-8 sm:space-y-8">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <UserMessageView key={m.id} message={m} />
            ) : (
              <AssistantMessageView key={m.id} message={m} isLast={i === messages.length - 1} onRetry={onRetry} />
            )
          )}
        </main>
      </div>

      <div className="relative mx-auto w-full max-w-3xl space-y-2.5 px-4 pt-1 pb-4 sm:pb-6">
        {!pinned && (
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Scroll to latest"
            onClick={() => setPinned(true)}
            className="absolute -top-10 left-1/2 -translate-x-1/2 rounded-full shadow-md"
          >
            <ArrowDown />
          </Button>
        )}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowQuick((v) => !v)}
            aria-expanded={showQuick}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {showQuick ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
            {showQuick ? 'Hide quick questions' : 'Show quick questions'}
          </button>
        </div>
        {showQuick && <QuickActions variant="row" onAsk={send} disabled={busy} />}
        <ChatInput onSend={send} onStop={onStop} busy={busy} autoFocus />
      </div>
    </div>
  )
}
