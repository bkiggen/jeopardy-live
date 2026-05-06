# syntax=docker/dockerfile:1
ARG NODE_VERSION=22.12.0

# ── Builder ───────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS builder

WORKDIR /app
ENV NODE_ENV=development

# Prisma needs openssl at build time for the engine binaries
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Same openssl runtime libs Prisma needs
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Compiled output + prisma artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Optional: bundle the Kaggle clue dump so we can `npm run import-clues`
# from the running container. Add it to .dockerignore allowlist below.
COPY src/data ./src/data

EXPOSE 8080
CMD ["node", "dist/server.js"]
