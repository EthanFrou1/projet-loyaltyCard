# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 : deps
# Installe uniquement les dépendances de production + dev (pour le build)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copier les manifestes du monorepo
COPY package.json package-lock.json turbo.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json     ./packages/types/
COPY apps/api/package.json           ./apps/api/

RUN npm ci --frozen-lockfile

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 : builder
# Génère le client Prisma et compile le TypeScript
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules         ./node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/apps/api/node_modules           ./apps/api/node_modules

# Copier les sources
COPY packages/database/ ./packages/database/
COPY packages/types/    ./packages/types/
COPY apps/api/          ./apps/api/
COPY tsconfig.base.json ./

# Générer le client Prisma
RUN cd packages/database && npx prisma generate

# Compiler le TypeScript
RUN cd apps/api && npx tsc

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 : runner
# Image finale légère — uniquement le JS compilé + dépendances de prod
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Créer un utilisateur non-root pour la sécurité
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 fastify

# Copier uniquement ce qui est nécessaire en prod
COPY --from=builder --chown=fastify:nodejs /app/apps/api/dist         ./dist
COPY --from=builder --chown=fastify:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=fastify:nodejs /app/node_modules           ./node_modules

# Schema Prisma nécessaire pour les migrations au runtime
COPY --chown=fastify:nodejs packages/database/prisma ./prisma

USER fastify

EXPOSE 3001

# Lancer les migrations puis démarrer le serveur
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
