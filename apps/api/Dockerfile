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

# Copier les sources
COPY packages/database/ ./packages/database/
COPY packages/types/    ./packages/types/
COPY apps/api/          ./apps/api/
COPY tsconfig.base.json ./

# Générer le client Prisma et compiler le package database
RUN cd packages/database && npx prisma generate && npx tsc

# Compiler l'API
RUN cd apps/api && npx tsc

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 : runner
# Image finale légère — uniquement le JS compilé + dépendances de prod
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# OpenSSL requis par le moteur Prisma sur Alpine
RUN apk add --no-cache openssl

# Créer un utilisateur non-root pour la sécurité
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 fastify

# Copier le code API compilé
COPY --from=builder --chown=fastify:nodejs /app/apps/api/dist ./dist
# Copier node_modules (contient un symlink @loyalty/database → ../../packages/database)
COPY --from=builder --chown=fastify:nodejs /app/node_modules  ./node_modules
# Supprimer le symlink workspace et le remplacer par les vrais fichiers compilés
RUN rm -rf ./node_modules/@loyalty/database
COPY --from=builder --chown=fastify:nodejs /app/packages/database/dist        ./node_modules/@loyalty/database/dist
COPY --from=builder --chown=fastify:nodejs /app/packages/database/package.json ./node_modules/@loyalty/database/package.json

# Schema Prisma nécessaire pour les migrations au runtime (Prisma cherche ./prisma par défaut)
COPY --chown=fastify:nodejs packages/database/prisma ./prisma

USER fastify

EXPOSE 3001

# Lancer les migrations puis démarrer le serveur
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
