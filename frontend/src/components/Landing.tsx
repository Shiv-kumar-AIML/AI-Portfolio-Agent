import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { lazy, Suspense } from 'react'
import { ChatInput } from '@/components/chat/ChatInput'
import { QuickActions } from '@/components/chat/QuickActions'
import { DeskSilhouette } from '@/components/desk/DeskSilhouette'
import { FallbackBoundary } from '@/components/FallbackBoundary'
import { SkyToggle } from '@/components/SkyToggle'
import type { PublicProfile } from '@/types'

// The voxel desk scene (three.js) loads in its own chunk. The download starts as soon as this
// module loads (not when the hero first renders), and an empty box of the same size holds the
// space until it is ready (a soft silhouette of the scene) — no placeholder face on refresh.
const deskSceneChunk = import('@/components/desk/DeskScene')
const DeskScene = lazy(() => deskSceneChunk)
const SCENE_BOX = 'aspect-[4/3] h-[clamp(11rem,46dvh,27rem)] max-w-[92vw]'

const hasWebGL = () => {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
// eslint-disable-next-line react-refresh/only-export-components -- App needs it to skip the dive
export const canRender3D = typeof window !== 'undefined' && hasWebGL()

export type SceneControl = {
  focused: boolean
  instant: boolean
  paused: boolean
  onArrive: (to: 0 | 1) => void
}

/** Wrapper that fades a piece of the hero out while the camera is inside the laptop. */
function Fade({ away, className, children }: { away: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('transition-opacity duration-500', away && 'pointer-events-none opacity-0', className)} aria-hidden={away || undefined}>
      {children}
    </div>
  )
}

/**
 * Two parts: the first screen is the introduction (greeting, title, avatar, input); scrolling down
 * reveals the quick questions, centred inside a huge, faint watermark word (profile.watermark).
 */
export function Landing({
  profile,
  onAsk,
  away = false,
  scene,
}: {
  profile: PublicProfile | null
  onAsk: (q: string) => void
  /** the camera is diving into / inside the laptop: everything but the scene fades away */
  away?: boolean
  scene?: SceneControl
}) {
  return (
    <main className="relative flex w-full flex-1 flex-col items-center overflow-x-clip px-4 text-center">
      {/* the sun / moon in the sky — it is the light/dark switch */}
      <Fade away={away} className="absolute top-6 right-[9%] z-10 sm:top-10 sm:right-[11%] lg:right-[13%]">
        <SkyToggle />
      </Fade>
      {/* First screen: greeting, title, avatar and the input fill the viewport below the top bar
          (4.5rem / 5.5rem tall). The tiles start below the fold. */}
      <section className="flex min-h-[calc(100dvh-4.5rem)] w-full max-w-3xl flex-col items-center sm:min-h-[calc(100dvh-5.5rem)]">
        <div aria-hidden className="max-h-3 flex-[3]" />
        <Fade away={away}>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="font-pixel text-lg font-medium text-foreground/85 sm:text-xl md:text-2xl"
        >
          Hey, I'm {profile?.firstName ?? '…'} 👋
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="vx-title mt-1 text-[2.75rem] leading-[1.05] font-bold tracking-wide text-balance sm:text-6xl md:text-7xl"
        >
          {profile?.title ?? 'AI Engineer'}
        </motion.h1>
        </Fade>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 120, damping: 16 }}
          className="mt-5 sm:mt-6"
        >
          {canRender3D ? (
            <FallbackBoundary fallback={<div className={SCENE_BOX} />}>
              <Suspense fallback={<DeskSilhouette className={SCENE_BOX} />}>
                {/* "me at work": walks in, sits down, opens the laptop, keeps working */}
                <DeskScene
                  className={`${SCENE_BOX} animate-in fade-in duration-700`}
                  focused={scene?.focused}
                  instant={scene?.instant}
                  paused={scene?.paused}
                  onArrive={scene?.onArrive}
                />
              </Suspense>
            </FallbackBoundary>
          ) : (
            <div className={SCENE_BOX} />
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 w-full max-w-xl sm:mt-8"
        >
          <Fade away={away}>
            <ChatInput size="lg" onSend={onAsk} placeholder="Know about me …" />
          </Fade>
        </motion.div>
        <div aria-hidden className="flex-1" />
      </section>

      {/* On scroll: the quick questions, centred inside a huge, faint watermark word. */}
      <section
        className={cn(
          'relative flex min-h-[clamp(12rem,22vw,22rem)] w-full flex-col items-center justify-center py-2 transition-opacity duration-500',
          away && 'pointer-events-none opacity-0'
        )}
      >
        <span
          aria-hidden="true"
          className="watermark pointer-events-none absolute inset-0 flex items-center justify-center font-heading text-[21vw] leading-none font-black tracking-tight whitespace-nowrap uppercase select-none sm:text-[21vw]"
        >
          {profile?.watermark ?? ''}
        </span>
        <div className="relative w-full max-w-3xl">
          <QuickActions onAsk={onAsk} />
        </div>
      </section>
    </main>
  )
}
