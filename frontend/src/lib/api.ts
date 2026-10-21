import { createSseParser } from '@/lib/sse'
import type { About, GithubActivity, Project, PublicProfile, RepoDetails, StreamFrame } from '@/types'

// Same-origin by default (nginx in production, the Vite proxy in dev).
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`
  try {
    const body = await res.json()
    if (body?.message) message = body.message
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(res.status, message)
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw await errorFrom(res)
  return res.json() as Promise<T>
}

/** WebSocket URL of an api path (same host as the page unless VITE_API_URL points elsewhere). */
export const wsUrl = (path: string) => {
  const base = new URL(API_BASE || window.location.origin)
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${base.origin}${path}`
}

export const fetchProfile = () => getJson<PublicProfile>('/api/profile')
export const fetchProjects = () => getJson<Project[]>('/api/projects')
export const fetchAbout = () => getJson<About>('/api/about')
export const fetchGithub = () => getJson<GithubActivity>('/api/github')
export const fetchRepo = (name: string) => getJson<RepoDetails>(`/api/github/repos/${encodeURIComponent(name)}`)

export async function sendContactForm(body: {
  name: string
  email: string
  message: string
  website?: string
}) {
  const res = await fetch(`${API_BASE}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await errorFrom(res)
}

/** POST the conversation and call `onFrame` for every streamed frame until the answer ends. */
export async function streamChat(options: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  sessionId: string
  signal: AbortSignal
  onFrame: (frame: StreamFrame) => void
}) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ messages: options.messages, sessionId: options.sessionId }),
    signal: options.signal,
  })
  if (!res.ok || !res.body) throw await errorFrom(res)

  const parser = createSseParser(options.onFrame)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    parser.push(decoder.decode(value, { stream: true }))
  }
  parser.push(decoder.decode())
  parser.end()
}
