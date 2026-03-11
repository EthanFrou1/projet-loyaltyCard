/**
 * Enregistrement de toutes les routes de l'API.
 * Chaque domaine est isolé dans son propre module.
 *
 * Arborescence :
 *   /auth/*         → authentification (login, logout, refresh, me)
 *   /business/*     → configuration du business
 *   /programs/*     → programmes fidélité
 *   /customers/*    → gestion des clients
 *   /wallet/*       → génération/mise à jour des passes wallet
 *   /ai/*           → jobs IA asynchrones
 */

import type { FastifyInstance } from "fastify";
import { authRoutes }     from "./auth.route.js";
import { businessRoutes } from "./business.route.js";
import { customerRoutes } from "./customers.route.js";
import { stampsRoutes }   from "./stamps.route.js";
import { walletRoutes }   from "./wallet.route.js";
import { aiRoutes }       from "./ai.route.js";
import { publicRoutes }   from "./public.route.js";
import { stripeRoutes }   from "./stripe.route.js";

export async function registerRoutes(app: FastifyInstance) {
  // Préfixe /api/v1 pour permettre des migrations sans casser les clients
  await app.register(authRoutes,     { prefix: "/api/v1/auth" });
  await app.register(businessRoutes, { prefix: "/api/v1/business" });
  await app.register(customerRoutes, { prefix: "/api/v1/customers" });
  await app.register(stampsRoutes,   { prefix: "/api/v1/customers" });
  await app.register(walletRoutes,   { prefix: "/api/v1/wallet" });
  await app.register(aiRoutes,       { prefix: "/api/v1/ai" });
  await app.register(stripeRoutes,   { prefix: "/api/v1/stripe" });

  // Routes publiques — accessibles sans authentification (inscription client)
  await app.register(publicRoutes, { prefix: "/api/v1/join" });

  // Healthcheck simple (sans auth)
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));
}
