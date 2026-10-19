import { Check, Copy, RotateCcw, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { ToolCardView } from '@/components/cards'
import { Markdown } from '@/components/Markdown'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { AssistantMessage, UserMessage } from '@/types'
import { useChatActions } from './ChatActions'
import { Sources } from './Sources'
import { ThinkingDots, ToolSteps } from './ToolSteps'

export function UserMessageView({ message }: { message: UserMessage }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] whitespace-pre-wrap text-primary-foreground sm:text-base">
        {message.text}
      </div>
    </motion.div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Copy answer"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {copied ? <Check className="text-emerald-500" /> : <Copy />}
    </Button>
  )
}

export function AssistantMessageView({
  message,
  isLast,
  onRetry,
}: {
  message: AssistantMessage
  isLast: boolean
  onRetry: () => void
}) {
  const { ask, profile, busy } = useChatActions()
  const streaming = message.status === 'streaming'
  const runningTool = message.steps.some((s) => s.status === 'running')
  const showThinking = streaming && !message.text && !runningTool

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <Avatar className="mt-0.5 size-8 shrink-0 ring-1 ring-border">
        <AvatarImage src={profile?.avatar} alt="" />
        <AvatarFallback>
          <Sparkles className="size-4" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-3">
        <ToolSteps steps={message.steps} />
        {message.cards.map((card) => (
          <ToolCardView key={card.id} card={card} />
        ))}
        {showThinking && <ThinkingDots />}
        {message.text && (
          <div className={streaming ? 'streaming-caret' : undefined}>
            <Markdown text={message.text} />
          </div>
        )}
        {message.status === 'error' && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
            <span className="flex-1">{message.error || 'Something went wrong.'}</span>
            {isLast && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RotateCcw /> Retry
              </Button>
            )}
          </div>
        )}
        {message.status === 'stopped' && isLast && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Stopped.
            <Button size="xs" variant="ghost" onClick={onRetry}>
              <RotateCcw /> Regenerate
            </Button>
          </div>
        )}
        {!streaming && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Sources sources={message.sources} />
            {message.text && message.status === 'done' && <CopyButton text={message.text} />}
          </div>
        )}
        {isLast && !streaming && message.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {message.suggestions.map((s, i) => (
              <motion.button
                key={s}
                type="button"
                disabled={busy}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                onClick={() => ask(s)}
                className="rounded-full border border-dashed px-3 py-1.5 text-left text-xs transition-colors hover:border-solid hover:bg-muted sm:text-sm"
              >
                {s}
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
