# --- STAGE 1: BUILDER ---
FROM node:22-alpine AS builder

WORKDIR /app

# 1. Manifests first, so the dependency layer is cached independently of the source
COPY package*.json ./

# 2. Install dependencies
# npm 11 is required: the lockfile is an npm 11 artifact, and node:22-alpine ships npm 10,
# which builds a different tree from it and fails `npm ci` with a misleading message.
RUN npm install -g npm@11 && npm ci

# 3. Then the source (.dockerignore keeps the noise out)
COPY . .

# 4. Generate the Prisma client (the schema path is monorepo-specific)
RUN npx prisma generate --schema=./apps/api/prisma/schema.prisma

# 5. Build both applications
RUN npx nx run api:build:production
RUN npx nx run client:build:production

# --- STAGE 2: BACKEND RUNNER ---
FROM node:22-alpine AS backend

WORKDIR /app

# OpenSSL, which Prisma needs on Alpine
RUN apk add --no-cache openssl

# package.json, for the runtime install
COPY package*.json ./
# npm 11 is required: the lockfile is an npm 11 artifact, and node:22-alpine ships npm 10,
# which builds a different tree from it and fails `npm ci` with a misleading message.
# Production dependencies only
RUN npm install -g npm@11 && npm ci --omit=dev

# The built backend
COPY --from=builder /app/dist/apps/api ./dist

# The Prisma directory, needed to run migrations on start. It moves from
# apps/api/prisma in the builder to ./prisma in the container.
COPY --from=builder /app/apps/api/prisma ./prisma

# The generated Prisma client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000

# Apply migrations against the schema copied to ./prisma, then start the server
CMD npx prisma migrate deploy --schema=./prisma/schema.prisma && node dist/main.js

# --- STAGE 3: FRONTEND RUNNER (Nginx) ---
FROM nginx:alpine AS frontend

# The built frontend
COPY --from=builder /app/dist/apps/client/browser /usr/share/nginx/html

# The Nginx config
# COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
EXPOSE 443

CMD ["nginx", "-g", "daemon off;"]
