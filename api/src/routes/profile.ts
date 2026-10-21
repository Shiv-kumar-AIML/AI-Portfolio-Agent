import { Router } from 'express';
import { publicReadLimiter } from '../middleware/rateLimiters';
import { getAbout, getProjects, getPublicProfile } from '../services/ContentService';
import {
  getGithubActivity,
  getRepoDetails,
  GithubUnavailableError,
  RepoNotFoundError,
} from '../services/GithubService';
import { repoNameSchema, validationError } from '../utils/validation';

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
 * /api/about:
 *   get:
 *     tags: [Public]
 *     summary: Bio, experience, education and skills (the mini-OS browser's career page)
 *     responses:
 *       200:
 *         description: bio, experience, education and skills from profile.json
 */
router.get('/about', publicReadLimiter, (_req, res) => {
  res.json(getAbout());
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

/**
 * @openapi
 * /api/github/repos/{name}:
 *   get:
 *     tags: [Public]
 *     summary: One of the owner's own repos — README, files, languages (cached for an hour)
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Repository details
 *       400:
 *         description: Invalid repository name
 *       404:
 *         description: Not one of the owner's public repos
 *       503:
 *         description: GitHub unavailable and nothing cached yet
 */
router.get('/github/repos/:name', publicReadLimiter, async (req, res) => {
  const parsed = repoNameSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json(validationError(parsed.error));
  try {
    res.json(await getRepoDetails(parsed.data.name));
  } catch (error) {
    if (error instanceof RepoNotFoundError) {
      return res.status(404).json({ message: error.message });
    }
    if (error instanceof GithubUnavailableError) {
      return res.status(503).json({ message: 'GitHub is unavailable right now' });
    }
    throw error;
  }
});

export default router;
