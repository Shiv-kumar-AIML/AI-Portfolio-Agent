import { ArrowRight, Square } from 'lucide-react'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MAX_CHARS = 2000

export interface ChatInputHandle {
  focus: () => void
}

interface ChatInputProps {
  onSend: (text: string) => void
  onStop?: () => void
  busy?: boolean
  placeholder?: string
  size?: 'lg' | 'default'
  autoFocus?: boolean
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  { onSend, onStop, busy = false, placeholder = 'Ask me anything…', size = 'default', autoFocus },
  ref
) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus() }))

  const resize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }

  const submit = () => {
    const text = value.trim()
    if (!text || busy || text.length > MAX_CHARS) return
    onSend(text)
    setValue('')
    requestAnimationFrame(resize)
  }

  const tooLong = value.length > MAX_CHARS
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className={cn(
        'vx group relative flex items-end gap-2 bg-card py-2 pr-2 pl-3 transition-shadow',
        'focus-within:ring-4 focus-within:ring-teal/25',
        size === 'lg' && 'py-2.5 pr-2.5 pl-4'
      )}
    >
      <textarea
        ref={textareaRef}
        value={value}
        rows={1}
        autoFocus={autoFocus}
        aria-label="Ask a question"
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value)
          resize()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        className={cn(
          'max-h-[180px] min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-muted-foreground sm:text-base',
          size === 'lg' && 'sm:text-lg'
        )}
      />
      {tooLong && (
        <span className="absolute -top-6 right-2 text-xs text-destructive">
          {value.length}/{MAX_CHARS}
        </span>
      )}
      {busy ? (
        <Button type="button" size="icon-lg" variant="secondary" onClick={onStop} aria-label="Stop generating" className="vx-sm vx-press size-10 rounded-md">
          <Square className="fill-current" />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon-lg"
          disabled={!value.trim() || tooLong}
          aria-label="Send"
          className="vx-sm vx-press size-10 rounded-md bg-teal text-white hover:bg-teal disabled:opacity-60 dark:text-[#0d1024]"
        >
          <ArrowRight />
        </Button>
      )}
    </form>
  )
})
