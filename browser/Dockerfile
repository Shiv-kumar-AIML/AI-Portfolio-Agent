# Chromium and its system libraries come with Playwright's image — keep its tag equal to the
# playwright version in package.json.
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS base

WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN npm ci

# ---- dev: used by docker-compose.local.yml (build.target: dev) ----
# No source COPY — compose bind-mounts ./browser over /app and runs `npm run dev` (tsx watch).
FROM base AS dev
EXPOSE 8090
CMD ["npm", "run", "dev"]

# ---- production: default target ----
FROM base AS production
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8090 CONTENT_DIR=/content
USER pwuser
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8090)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
