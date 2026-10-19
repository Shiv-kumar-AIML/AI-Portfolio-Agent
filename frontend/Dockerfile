FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- dev: used by docker-compose.local.yml (build.target: dev) ----
# No source COPY — compose bind-mounts ./frontend over /app so Vite's HMR picks up changes live.
FROM base AS dev
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---- build ----
FROM base AS build
COPY . .
RUN npm run build

# ---- production: static files only; the edge nginx (nginx/production.conf) routes /api to the api ----
FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
RUN printf '%s\n' \
    'server {' \
    '    listen 80;' \
    '    root /usr/share/nginx/html;' \
    '    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }' \
    '    location / { try_files $uri $uri/ /index.html; add_header Cache-Control "no-cache"; }' \
    '}' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
