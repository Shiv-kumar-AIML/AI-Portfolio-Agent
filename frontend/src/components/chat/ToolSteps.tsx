import { Check, CircleAlert, Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ToolStep } from '@/types'

/** The agent's progress lines ("Checking my GitHub…"), each resolving to a check when done. */
export function ToolSteps({ steps }: { steps: ToolStep[] }) {
  if (!steps.length) return null
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="What the assistant did">
      <AnimatePresence initial={false}>
        {steps.map((step) => (
          <motion.li
            key={step.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground sm:text-xs"
          >
            {step.status === 'running' && <Loader2 className="size-3 animate-spin" />}
            {step.status === 'done' && <Check className="size-3 text-emerald-500" />}
            {step.status === 'error' && <CircleAlert className="size-3 text-amber-500" />}
            {step.status === 'running' ? step.label : step.label.replace(/…$/, '')}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}

export function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-2 text-sm text-muted-foreground" role="status">
      <span className="sr-only">Thinking</span>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-current"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  )
}
