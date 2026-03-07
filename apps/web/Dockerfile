# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 : deps
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/web/package.json       ./apps/web/

RUN npm ci --frozen-lockfile

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 : builder
# Next.js build (output standalone pour une image légère)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules      ./node_modules

COPY packages/types/ ./packages/types/
COPY apps/web/       ./apps/web/
COPY tsconfig.base.json ./

# Variables d'env publiques injectées au build
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN cd apps/web && npx next build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 : runner
# Mode standalone Next.js — image ~100 MB au lieu de ~1 GB
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Avec outputFileTracingRoot, le standalone est à la racine du monorepo
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# Les fichiers statiques et publics sont résolus relativement à /app/apps/web/server.js
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public           ./apps/web/public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
