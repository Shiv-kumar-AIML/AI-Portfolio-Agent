export interface Socials {
  github?: string
  linkedin?: string
  x?: string
  kaggle?: string
  huggingface?: string
  website?: string
}

export interface PublicProfile {
  name: string
  firstName: string
  watermark?: string
  title: string
  tagline: string
  location?: string
  timezone?: string
  availability?: string
  avatar?: string
  email?: string
  socials: Socials
  resumeUrl?: string
  calendlyUrl?: string | null
}

export interface Project {
  slug: string
  title: string
  tagline: string
  year?: number
  featured?: boolean
  status?: string
  tags: string[]
  stack: string[]
  metrics?: Array<{ label: string; value: string }>
  links?: { github?: string; demo?: string; paper?: string }
  image?: string
}

export interface Source {
  id: string
  title: string
  section: string
  snippet: string
  score?: number
}

/** Frames streamed by POST /api/chat — see ai-service/docs/STREAM_CONTRACT.md. */
export type StreamFrame =
  | { type: 'tool_start'; id: string; name: string; label: string }
  | { type: 'tool_result'; id: string; name: string; card: CardType; data: unknown }
  | { type: 'tool_end'; id: string; name: string; ok: boolean }
  | { type: 'content'; delta: string }
  | { type: 'sources'; sources: Source[] }
  | { type: 'suggestions'; items: string[] }
  | { type: 'done'; model?: string; steps?: number }
  | { type: 'error'; message: string }

export type CardType =
  | 'profile'
  | 'projects'
  | 'project'
  | 'skills'
  | 'experience'
  | 'resume'
  | 'contact'
  | 'github'
  | 'message_sent'
  | 'open_link'

export interface ToolStep {
  id: string
  name: string
  label: string
  status: 'running' | 'done' | 'error'
}

export interface ToolCard {
  id: string
  card: CardType
  data: unknown
}

export interface UserMessage {
  id: string
  role: 'user'
  text: string
}

export interface AssistantMessage {
  id: string
  role: 'assistant'
  text: string
  steps: ToolStep[]
  cards: ToolCard[]
  sources: Source[]
  suggestions: string[]
  status: 'streaming' | 'done' | 'error' | 'stopped'
  error?: string
}

export type Message = UserMessage | AssistantMessage

export interface SkillGroup {
  category: string
  items: string[]
}

export interface Job {
  company: string
  role: string
  start: string
  end: string | null
  location?: string
  summary?: string
  highlights?: string[]
  stack?: string[]
}

export interface Education {
  institution: string
  degree: string
  start?: string
  end?: string
  notes?: string
}

/** GET /api/about — the career page in the mini-OS browser. */
export interface About {
  bio: string
  experience: Job[]
  education: Education[]
  skills: SkillGroup[]
}

export interface GithubActivity {
  username: string
  profileUrl: string
  avatarUrl: string | null
  name: string | null
  bio: string | null
  publicRepos: number
  followers: number
  totalStars: number
  topLanguages: Array<{ name: string; repos: number }>
  recentRepos: Array<{ name: string; description: string | null; url: string; stars: number; language: string | null; updatedAt: string }>
  allRepos: Array<{ name: string; description: string | null; language: string | null }>
}

export interface RepoDetails {
  name: string
  url: string
  description: string | null
  homepage: string | null
  topics: string[]
  stars: number
  forks: number
  defaultBranch: string
  createdAt: string
  pushedAt: string
  languages: Array<{ name: string; percent: number }>
  readme: string | null
  readmeTruncated: boolean
  files: string[]
  totalFiles: number
}
