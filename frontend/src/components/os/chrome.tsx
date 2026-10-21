import { cn } from '@/lib/utils'

// Window chrome shared by the mini-OS apps (Messages, Browser).

// exit depends on why the window goes away (read at exit time through AnimatePresence `custom`)
export const WINDOW_VARIANTS = {
  hidden: { opacity: 0, scale: 0.92, y: 24 },
  shown: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 26 } },
  gone: (w: string) =>
    w === 'closing'
      ? { opacity: 0, scale: 0.85, transition: { duration: 0.22 } }
      : { opacity: 0, scale: 0.3, y: 320, transition: { duration: 0.35 } },
}

export function TrafficLights({
  closeLabel,
  onClose,
  onMinimize,
  onMaximize,
}: {
  closeLabel: string
  onClose: () => void
  onMinimize: () => void
  onMaximize: () => void
}) {
  const dot = 'group/dot grid size-3.5 place-items-center rounded-[3px] border-2 border-vx-edge text-[8px] font-black leading-none text-black/70 sm:size-4'
  return (
    <div className="group flex items-center gap-1.5 sm:gap-2" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" aria-label={closeLabel} onClick={onClose} className={cn(dot, 'bg-[#ff5f57]')}>
        <span className="opacity-0 group-hover:opacity-100">×</span>
      </button>
      <button type="button" aria-label="Minimise" onClick={onMinimize} className={cn(dot, 'bg-[#febc2e]')}>
        <span className="opacity-0 group-hover:opacity-100">–</span>
      </button>
      <button type="button" aria-label="Maximise" onClick={onMaximize} className={cn(dot, 'bg-[#28c840]')}>
        <span className="opacity-0 group-hover:opacity-100">+</span>
      </button>
    </div>
  )
}
