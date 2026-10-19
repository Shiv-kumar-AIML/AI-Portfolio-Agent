import { BookOpen, ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { Source } from '@/types'

/** Citations from the RAG search — collapsed by default so they never crowd the answer. */
export function Sources({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false)
  if (!sources.length) return null
  return (
    <div className="min-w-0 max-w-full text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <BookOpen className="size-3.5" />
        {sources.length} source{sources.length > 1 ? 's' : ''} from my notes
        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-2 grid grid-cols-1 gap-2 overflow-hidden sm:grid-cols-2"
          >
            {sources.map((s, i) => (
              <li key={s.id} className="min-w-0 rounded-lg border bg-muted/30 p-3">
                <div className="mb-1 flex items-center gap-2 text-xs font-medium">
                  <span className="flex size-4 items-center justify-center rounded bg-primary/10 font-mono text-[10px]">
                    {i + 1}
                  </span>
                  <span className="truncate">
                    {s.title}
                    {s.section ? ` › ${s.section}` : ''}
                  </span>
                </div>
                <p className="line-clamp-3 text-xs text-muted-foreground">{s.snippet}</p>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  )
}
