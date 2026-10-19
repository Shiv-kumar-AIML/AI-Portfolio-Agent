import { z } from 'zod';

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});

export const chatRequestSchema = z
  .object({
    messages: z.array(chatMessageSchema).min(1).max(30),
    sessionId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/, 'sessionId must be 8-64 URL-safe characters')
      .optional(),
  })
  // Zod still runs refinements when `messages` failed min(1), so these must cope with an empty list.
  .refine((body) => body.messages.at(-1)?.role === 'user', {
    message: 'The last message must be from the user',
    path: ['messages'],
  })
  .refine((body) => (body.messages.at(-1)?.content.length ?? 0) <= 2000, {
    message: 'Your message is too long (max 2000 characters)',
    path: ['messages'],
  });

export const contactMessageSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.email('Enter a valid email address').max(200),
  message: z.string().trim().min(5, 'Message is too short').max(2000),
});

export const contactFormSchema = contactMessageSchema.extend({
  // Honeypot: hidden in the form, so only bots fill it in.
  website: z.string().max(200).optional(),
});

export const internalMessageSchema = contactMessageSchema.extend({
  sessionId: z.string().max(64).nullable().optional(),
});

export const messageStatusSchema = z.object({
  status: z.enum(['NEW', 'READ', 'ARCHIVED']),
});

export const validationError = (error: z.ZodError) => ({
  message: error.issues[0]?.message || 'Invalid request',
  issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
});
