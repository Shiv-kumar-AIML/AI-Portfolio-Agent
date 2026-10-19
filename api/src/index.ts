import 'dotenv/config';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import adminRoutes from './routes/admin';
import chatRoutes from './routes/chat';
import contactRoutes from './routes/contact';
import internalRoutes from './routes/internal';
import profileRoutes from './routes/profile';
import swaggerSpec from './swagger';

const app = express();
app.set('trust proxy', 1); // behind nginx: rate limits key on the real client IP
const port = Number(process.env.PORT) || 5010;

app.use(helmet());

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin = same-origin (through nginx), curl, or the ai-service.
      callback(null, !origin || allowedOrigins.includes(origin));
    },
  })
);
app.use(express.json({ limit: '100kb' }));

if (process.env.ENABLE_API_DOCS === 'true') {
  // Swagger UI needs inline scripts the default CSP blocks — relax it for this route only.
  app.use(
    '/api-docs',
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec)
  );
}

app.use('/api', profileRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/internal', internalRoutes);

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Liveness check
 *     responses:
 *       200:
 *         description: The server is up
 */
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

type HttpError = Error & { type?: string };

// Express 5 forwards rejected async handlers here.
app.use((error: HttpError, _req: Request, res: Response, _next: NextFunction) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body too large' });
  }
  console.error('Unhandled error:', error);
  if (res.headersSent) return res.end();
  res.status(500).json({ message: 'Internal server error' });
});

// Only listen when run directly; tests import the app with supertest.
if (require.main === module) {
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection (process kept running):', reason);
  });
  app.listen(port, () => {
    console.log(`Portfolio API listening on port ${port}`);
  });
}

export default app;
