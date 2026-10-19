// Browser storage can be unavailable (private mode, blocked site data) — every access is guarded and
// the app works without it.

export function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked */
  }
}

export function removeSession(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* blocked */
  }
}

const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

/** One id per browser tab visit — lets the owner group a visitor's questions in the chat logs. */
export function getSessionId(): string {
  const existing = readSession<string | null>('portfolio.sessionId', null)
  if (existing) return existing
  const id = randomId()
  writeSession('portfolio.sessionId', id)
  return id
}

export const newId = randomId

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked */
  }
}
