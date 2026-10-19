import { Briefcase, FolderGit2, Layers, Smile } from 'lucide-react'
import { motion } from 'motion/react'
import { GithubIcon } from '@/components/BrandIcons'
import { cn } from '@/lib/utils'

const QUICK_ACTIONS = [
  { label: 'Me', question: 'Who are you? Tell me about yourself.', Icon: Smile, tint: 'text-amber-500' },
  { label: 'Projects', question: 'What projects have you built?', Icon: FolderGit2, tint: 'text-violet-500' },
  { label: 'Skills', question: 'What are your skills and tech stack?', Icon: Layers, tint: 'text-sky-500' },
  { label: 'Experience', question: 'Walk me through your work experience.', Icon: Briefcase, tint: 'text-emerald-500' },
  { label: 'GitHub', question: 'Show me your GitHub activity.', Icon: GithubIcon, tint: 'text-foreground' },
] as const

export function QuickActions({
  onAsk,
  disabled,
  variant = 'grid',
}: {
  onAsk: (question: string) => void
  disabled?: boolean
  variant?: 'grid' | 'row'
}) {
  return (
    <div
      className={cn(
        variant === 'grid'
          ? 'flex flex-wrap justify-center gap-2.5 sm:gap-3'
          : '-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:justify-center-safe'
      )}
    >
      {QUICK_ACTIONS.map(({ label, question, Icon, tint }, i) => (
        <motion.button
          key={label}
          type="button"
          disabled={disabled}
          onClick={() => onAsk(question)}
          initial={variant === 'grid' ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 + i * 0.04 }}
          className={cn(
            'shrink-0 border border-border/70 bg-background/70 font-medium backdrop-blur-md transition-all duration-200',
            'hover:-translate-y-0.5 hover:border-border hover:bg-background hover:shadow-lg hover:shadow-black/5 disabled:pointer-events-none disabled:opacity-50',
            variant === 'grid'
              ? 'flex h-20 w-[104px] flex-col items-center justify-center gap-2 rounded-2xl text-[13px] shadow-sm shadow-black/[0.03] sm:h-[84px] sm:w-[120px] sm:text-sm'
              : 'inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs shadow-sm sm:h-11 sm:gap-2 sm:text-sm'
          )}
        >
          <Icon className={cn(variant === 'grid' ? 'size-5' : 'size-4', tint)} />
          {label}
        </motion.button>
      ))}
    </div>
  )
}
