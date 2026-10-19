import path from 'path';

// Set before any app module is imported (rate limiters and services read env at import time).
process.env.NODE_ENV = 'test';
process.env.INTERNAL_SERVICE_KEY = 'test-internal-key-0123456789abcdef';
process.env.ADMIN_TOKEN = 'test-admin-token';
process.env.AI_SERVICE_URL = 'http://ai-service.test';
process.env.CONTENT_DIR = path.resolve(__dirname, '../../content');
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.CHAT_RATE_LIMIT_PER_MINUTE = '1000';
process.env.CHAT_RATE_LIMIT_PER_DAY = '1000';
process.env.CONTACT_RATE_LIMIT_PER_HOUR = '1000';
delete process.env.NOTIFY_WEBHOOK_URL;
delete process.env.GITHUB_TOKEN;
