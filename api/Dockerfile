FROM node:22-slim AS base

# OpenSSL is required by Prisma's query engine
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

# ---- dev: used by docker-compose.local.yml (build.target: dev) ----
# No source COPY — compose bind-mounts ./api over /app and runs `npm run dev` (tsx watch).
FROM base AS dev
EXPOSE 5010
CMD ["npm", "run", "dev"]

# ---- production: default target ----
FROM base AS production
COPY . .
# Dev deps stay: the entrypoint runs `prisma migrate deploy`, which needs the prisma CLI.
RUN npm run build && chmod +x docker-entrypoint.sh
ENV NODE_ENV=production PORT=5010 CONTENT_DIR=/content
USER node
EXPOSE 5010
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5010)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "start"]
