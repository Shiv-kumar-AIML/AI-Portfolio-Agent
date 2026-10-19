import { Router } from 'express';
import { contactLimiter } from '../middleware/rateLimiters';
import { createMessage } from '../services/MessageService';
import { contactFormSchema, validationError } from '../utils/validation';

const router = Router();

/**
 * @openapi
 * /api/contact:
 *   post:
 *     tags: [Public]
 *     summary: Send the owner a message through the contact form
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, message]
 *             properties:
 *               name: { type: string, maxLength: 100 }
 *               email: { type: string, format: email }
 *               message: { type: string, minLength: 5, maxLength: 2000 }
 *               website: { type: string, description: Honeypot — leave empty }
 *     responses:
 *       201:
 *         description: Message saved
 *       400:
 *         description: Validation failed
 *       429:
 *         description: Rate limited
 */
router.post('/', contactLimiter, async (req, res) => {
  const parsed = contactFormSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(validationError(parsed.error));
  const { website, ...message } = parsed.data;
  // A filled honeypot is a bot: answer like a success so it learns nothing, store nothing.
  if (website) return res.status(201).json({ message: 'Message sent' });
  await createMessage({ ...message, source: 'FORM' });
  res.status(201).json({ message: 'Message sent' });
});

export default router;
