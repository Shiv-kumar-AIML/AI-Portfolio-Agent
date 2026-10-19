import fs from 'fs';
import path from 'path';

// content/ is the single source of truth shared with ai-service (mounted read-only at /content in
// Docker). Outside Docker the api runs from api/, so the repo's content folder is ../content.
export const contentDir = () => process.env.CONTENT_DIR || path.resolve(process.cwd(), '../content');

export type Profile = Record<string, any> & {
  name: string;
  projects?: Array<Record<string, any> & { slug: string }>;
};

let cached: { profile: Profile; mtimeMs: number } | null = null;

/** The profile, re-read whenever profile.json changes on disk (edits show up without a restart). */
export const getProfile = (): Profile => {
  const file = path.join(contentDir(), 'profile.json');
  const { mtimeMs } = fs.statSync(file);
  if (!cached || cached.mtimeMs !== mtimeMs) {
    const profile = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete profile._note;
    cached = { profile, mtimeMs };
  }
  return cached.profile;
};

/** What the frontend needs for the landing page — everything except long lists. */
export const getPublicProfile = () => {
  const p = getProfile();
  return {
    name: p.name,
    firstName: p.firstName || p.name.split(' ')[0],
    // Big faint word behind the landing input; defaults to the first name.
    watermark: p.watermark || p.firstName || p.name.split(' ')[0],
    title: p.title,
    tagline: p.tagline,
    location: p.location,
    timezone: p.timezone,
    availability: p.availability,
    avatar: p.avatar,
    email: p.email,
    socials: Object.fromEntries(Object.entries(p.socials || {}).filter(([, v]) => v)),
    resumeUrl: p.resumeUrl,
    calendlyUrl: p.calendlyUrl || null,
  };
};

export const getProjects = () => getProfile().projects || [];
