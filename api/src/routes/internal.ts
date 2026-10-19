import { Router } from 'express';
import { requireInternalService } from '../middleware/auth';
import {
  getGithubActivity,
  getRepoDetails,
  GithubUnavailableError,
  RepoNotFoundError,
} from '../services/GithubService';
import { createMessage } from '../services/MessageService';
import { internalMessageSchema, validationError } from '../utils/validation';

// Routes the ai-service's tools call. Never routed by nginx — reachable only on the Docker network.
const router = Router();
router.use(requireInternalService);

router.get('/github', async (_req, res) => {
  try {
    res.json(await getGithubActivity());
  } catch (error) {
    if (error instanceof GithubUnavailableError) {
      return res.status(503).json({ message: error.message });
    }
    throw error;
  }
});

// GitHub repo names: letters, digits, '.', '-', '_' (max 100). Validated before it goes anywhere.
const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

router.get('/github/repos/:name', async (req, res) => {
  const { name } = req.params;
  if (!REPO_NAME.test(name)) return res.status(400).json({ message: 'Invalid repository name' });
  try {
    res.json(await getRepoDetails(name));
  } catch (error) {
    if (error instanceof RepoNotFoundError) {
      return res.status(404).json({ message: error.message, available: error.available });
    }
    if (error instanceof GithubUnavailableError) {
      return res.status(503).json({ message: error.message });
    }
    throw error;
  }
});

router.post('/messages', async (req, res) => {
  const parsed = internalMessageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(validationError(parsed.error));
  const saved = await createMessage({ ...parsed.data, source: 'AGENT' });
  res.status(201).json(saved);
});

export default router;
