import { Router } from 'express';
import { publicReadLimiter } from '../middleware/rateLimiters';
import { getProjects, getPublicProfile } from '../services/ContentService';
import { getGithubActivity, GithubUnavailableError } from '../services/GithubService';

const router = Router();

/**
 * @openapi
 * /api/profile:
 *   get:
 *     tags: [Public]
 *     summary: The owner's public profile for the landing page
 *     responses:
 *       200:
 *         description: name, title, tagline, avatar, socials, resume and booking links
 */
router.get('/profile', publicReadLimiter, (_req, res) => {
  res.json(getPublicProfile());
});

/**
 * @openapi
 * /api/projects:
 *   get:
 *     tags: [Public]
 *     summary: All projects from profile.json
 *     responses:
 *       200:
 *         description: Array of projects
 */
router.get('/projects', publicReadLimiter, (_req, res) => {
  res.json(getProjects());
});

/**
 * @openapi
 * /api/github:
 *   get:
 *     tags: [Public]
 *     summary: Live GitHub stats (cached for an hour)
 *     responses:
 *       200:
 *         description: Repos, stars, top languages and recently updated repositories
 *       503:
 *         description: GitHub unavailable and nothing cached yet
 */
router.get('/github', publicReadLimiter, async (_req, res) => {
  try {
    res.json(await getGithubActivity());
  } catch (error) {
    if (error instanceof GithubUnavailableError) {
      return res.status(503).json({ message: 'GitHub stats are unavailable right now' });
    }
    throw error;
  }
});

export default router;
