import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { PublicProfile } from '@/types'

/**
 * The owner's local time, live, with what they're probably up to at that hour —
 * "Dehradun · 4:52 PM · coding 💻", and at night "11:40 PM · probably sleeping 😴". Uses the
 * profile's IANA timezone, so it is right for every visitor wherever they are.
 */

type Vibe = { icon: string; text: string; night: boolean }

export function vibeAt(hour: number): Vibe {
  if (hour >= 0 && hour < 6) return { icon: '🌙', text: 'probably sleeping 😴', night: true }
  if (hour < 9) return { icon: '🌅', text: 'waking up ☕', night: false }
  if (hour < 13) return { icon: '☀️', text: 'coding 💻', night: false }
  if (hour < 14) return { icon: '☀️', text: 'lunch break 🍛', night: false }
  if (hour < 19) return { icon: '☀️', text: 'building things 🛠️', night: false }
  if (hour < 22) return { icon: '🌆', text: 'learning something new 📚', night: false }
  return { icon: '🌙', text: 'late-night coding 🌙', night: true }
}

function useClock(timeZone: string | undefined) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // tick on the minute boundary, then every minute
    let interval: ReturnType<typeof setInterval> | undefined
    const timeout = setTimeout(() => {
      setNow(new Date())
      interval = setInterval(() => setNow(new Date()), 60_000)
    }, 60_000 - (Date.now() % 60_000))
    return () => {
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [])
  const tz = timeZone || undefined
  let time: string
  let hour: number
  try {
    time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(now)
    hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now))
  } catch {
    // unknown timezone string: fall back to the visitor's clock rather than breaking the header
    time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(now)
    hour = now.getHours()
  }
  return { time, hour }
}

export function LocalTimePill({ profile }: { profile: PublicProfile | null }) {
  const { time, hour } = useClock(profile?.timezone)
  const vibe = vibeAt(hour)
  const city = profile?.location?.split(',')[0]?.trim()

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      title={city ? `My local time in ${city}` : 'My local time'}
      className="inline-flex h-9 items-center gap-2 rounded-full border bg-background/80 px-3 text-xs font-medium shadow-sm backdrop-blur sm:h-10 sm:px-4 sm:text-sm"
    >
      <span aria-hidden="true">{vibe.icon}</span>
      {city && <span className="hidden text-muted-foreground lg:inline">{city} ·</span>}
      <span className="font-mono tabular-nums">{time}</span>
      <span className="hidden text-muted-foreground sm:inline">·</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={vibe.text}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="hidden sm:inline"
        >
          {vibe.text}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  )
}
