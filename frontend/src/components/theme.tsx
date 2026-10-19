import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { readLocal, writeLocal } from '@/lib/storage'

// A small replacement for next-themes: that library injects a <script> from inside React, which
// React 19 warns about in a client-only app. Here the pre-paint class is set by the inline script in
// index.html (same storage key), and this provider keeps it in sync afterwards.
export type Theme = 'light' | 'dark' | 'system'
export const THEME_STORAGE_KEY = 'portfolio.theme'
// Light by default (the fluid reads as pastel smoke on white); visitors can switch.
export const DEFAULT_THEME: Theme = 'light'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
})

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readLocal<Theme>(THEME_STORAGE_KEY, DEFAULT_THEME))
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolvedTheme === 'dark')
    root.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    writeLocal(THEME_STORAGE_KEY, next)
  }, [])

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export const useTheme = () => useContext(ThemeContext)
