# LoyaltyCard Platform

Plateforme SaaS de carte de fidélité digitale — ajout en Apple Wallet et Google Wallet.

**MVP :** 1 salon de coiffure · 10 tampons = 10 € de réduction · Scalable 10–20 salons

---

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend | Fastify + Prisma |
| Base de données | PostgreSQL (Neon / Supabase) |
| Queue | BullMQ + Redis (Upstash) |
| Storage | Cloudflare R2 (compatible S3) |
| Auth | JWT access (15 min) + refresh (30 j) |
| IA | OpenAI Images API |
| Monorepo | Turborepo + npm workspaces |

---

## Structure du projet

```
projet-loyaltyCard/
├── apps/
│   ├── api/               # Backend Fastify
│   │   ├── src/
│   │   │   ├── plugins/   # cors, jwt, multipart, rate-limit
│   │   │   ├── routes/    # auth, business, customers, stamps, wallet, ai
│   │   │   ├── services/  # logique métier
│   │   │   ├── workers/   # worker BullMQ (jobs IA)
│   │   │   └── lib/       # queue Redis, storage R2
│   │   └── Dockerfile
│   └── web/               # Frontend Next.js
│       ├── src/app/
│       │   ├── (auth)/    # login
│       │   └── (dashboard)/  # customers, ai, settings
│       └── Dockerfile
├── packages/
│   ├── database/          # Prisma schema + client singleton
│   └── types/             # Types TypeScript partagés (API contracts)
├── docker-compose.yml
├── turbo.json
└── .env.example
```

---

## Démarrage rapide

### Option A — Docker (recommandé)

```bash
# 1. Copier et remplir les variables d'environnement
cp .env.example .env

# 2. Démarrer tous les services (postgres, redis, api, web, worker)
docker compose up -d

# 3. Vérifier que tout tourne
docker compose ps
docker compose logs -f api
```

L'application est disponible sur :
- **Dashboard** → http://localhost:3000
- **API** → http://localhost:3001
- **Healthcheck** → http://localhost:3001/health

### Option B — Développement local

**Prérequis :** Node.js 20+, PostgreSQL, Redis

```bash
# 1. Installer les dépendances
npm install

# 2. Copier et remplir les variables d'environnement
cp .env.example .env

# 3. Générer le client Prisma et migrer la DB
npm run db:generate
npm run db:migrate

# 4. Démarrer en dev (api + web en parallèle via Turborepo)
npm run dev
```

---

## Variables d'environnement

Copier [.env.example](.env.example) en `.env` et remplir les valeurs.

| Variable | Description |
|---|---|
| `DATABASE_URL` | URL PostgreSQL (Neon, Supabase, ou local) |
| `REDIS_URL` | URL Redis (Upstash ou local) |
| `JWT_SECRET` | Secret JWT access token (min. 32 chars) |
| `OPENAI_API_KEY` | Clé API OpenAI pour les features IA |
| `R2_*` | Credentials Cloudflare R2 pour le stockage |
| `GOOGLE_WALLET_*` | Service account Google Wallet |
| `APPLE_*` | Certificats et identifiants Apple PassKit |

---

## API — Endpoints principaux

```
POST   /api/v1/auth/login
GET    /api/v1/auth/me

GET    /api/v1/business
GET    /api/v1/business/programs
POST   /api/v1/business/programs

GET    /api/v1/customers
POST   /api/v1/customers
GET    /api/v1/customers/:id
POST   /api/v1/customers/:id/stamp     ← +1 tampon
POST   /api/v1/customers/:id/redeem    ← consommer la récompense

POST   /api/v1/wallet/google/:id/jwt
POST   /api/v1/wallet/apple/:id/create
GET    /api/v1/wallet/apple/:id/download

POST   /api/v1/ai/clean-logo
POST   /api/v1/ai/generate-pass-design
POST   /api/v1/ai/generate-promo-assets
GET    /api/v1/ai/jobs/:id
GET    /api/v1/ai/usage
```

---

## Commandes utiles

```bash
# Base de données
npm run db:studio          # Prisma Studio (UI pour explorer la DB)
npm run db:migrate         # Créer et appliquer une migration

# Docker
docker compose up -d                  # Démarrer
docker compose down                   # Arrêter
docker compose down -v                # Arrêter + supprimer les volumes
docker compose logs -f api            # Logs API en temps réel
docker compose exec postgres psql -U loyalty loyalty_db  # Shell PostgreSQL
```

---

## Pricing

| Plan | Prix | Génération IA | Programmes |
|---|---|---|---|
| Starter | 19 €/mois | 20/mois | 1 |
| Pro | 39 €/mois | 100/mois | 3 |
| Business | 69 €/mois | 300/mois | illimité |

Crédits IA : +100 générations = 5 € · +500 générations = 20 €

---

## Roadmap MVP

- [x] Structure monorepo (Turborepo)
- [x] Schéma Prisma (10 tables)
- [x] API Fastify (auth, customers, stamps, wallet, ai)
- [x] Dashboard Next.js (liste clients, détail, outils IA)
- [x] Docker + docker-compose
- [ ] Seed base de données (1er business + user admin)
- [ ] Apple Wallet — signing `.pkpass` (`passkit-generator`)
- [ ] Google Wallet — appels API (`googleapis`)
- [ ] Push APNs Apple (mise à jour automatique du pass)
- [ ] Stripe — abonnements et crédits IA
- [ ] Stats dashboard (visites/mois, récompenses délivrées)
