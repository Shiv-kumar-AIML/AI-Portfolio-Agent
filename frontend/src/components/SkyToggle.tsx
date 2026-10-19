import { lazy, Suspense, useRef } from 'react'
import { useTheme } from '@/components/theme'
import { cn } from '@/lib/utils'

// Same three.js chunk family as the desk scene; the glow alone shows until it is ready.
const VoxelSky = lazy(() => import('@/components/desk/VoxelSky'))

/**
 * A little voxel sun hanging in the sky of the landing page — it is the theme switch. Click it and
 * the sun sets while a voxel moon rises (dark mode); click the moon to bring the day back. The desk
 * scene reads the same theme and swaps its sunlight for cool moonlight from this corner of the sky.
 */
export function SkyToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const dark = useRef(isDark)
  dark.current = isDark

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Good morning ☀️' : 'Good night 🌙'}
      className={cn(
        'group relative size-20 cursor-pointer rounded-full outline-none transition-transform duration-300 hover:scale-110 focus-visible:ring-4 focus-visible:ring-ring/40 sm:size-24',
        className
      )}
    >
      {/* glowing halo behind the voxels — warm by day, cool by night — breathing slowly */}
      <span
        className={cn(
          'sky-glow pointer-events-none absolute -inset-2 rounded-full blur-2xl transition-colors duration-700',
          isDark ? 'bg-[#b8ccff]/45' : 'bg-[#ffcf4a]/60'
        )}
      />
      <span
        className={cn(
          'pointer-events-none absolute inset-3 rounded-full blur-md transition-colors duration-700',
          isDark ? 'bg-[#dfe7ff]/35' : 'bg-[#fff1a8]/55'
        )}
      />
      <span
        className={cn(
          'absolute -inset-3 transition-[filter] duration-700',
          isDark
            ? 'drop-shadow-[0_0_10px_rgba(200,215,255,0.85)]'
            : 'drop-shadow-[0_0_12px_rgba(255,200,60,0.9)]'
        )}
      >
        <Suspense fallback={null}>
          <VoxelSky dark={dark} />
        </Suspense>
      </span>
    </button>
  )
}
