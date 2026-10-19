import swaggerJsdoc from 'swagger-jsdoc';

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Portfolio API',
      version: '1.0.0',
      description:
        'Public API gateway for the AI portfolio: profile, projects, GitHub, chat (SSE) and contact.',
    },
  },
  apis: ['./src/routes/*.ts', './src/index.ts', './dist/routes/*.js', './dist/index.js'],
});

export default swaggerSpec;
