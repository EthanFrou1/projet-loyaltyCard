/**
 * Plugin JWT
 *
 * Deux tokens :
 *   - access_token  : courte durée (15 min), envoyé dans chaque requête
 *   - refresh_token : longue durée (30j), utilisé uniquement sur POST /auth/refresh
 *
 * Payload JWT :
 *   { sub: userId, business_id: string, role: UserRole }
 *
 * Usage dans les routes :
 *   await request.jwtVerify()  // vérifie et décode le token
 *   request.user               // payload décodé
 */

import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export async function registerJwt(app: FastifyInstance) {
  await app.register(fastifyJwt, {
    secret: process.env["JWT_SECRET"] ?? "dev-secret-change-me",
    sign: {
      expiresIn: process.env["JWT_EXPIRES_IN"] ?? "15m",
    },
  });

  // Décorateur pratique pour protéger une route
  // Usage dans une route : preHandler: app.authenticate
  app.decorate(
    "authenticate",
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
      } catch {
        reply.status(401).send({ error: "Unauthorized", message: "Token invalide ou expiré" });
      }
    }
  );
}

// Augmentation des types Fastify pour que TypeScript connaisse le décorateur
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: {
      sub: string;        // userId
      business_id: string;
      role: string;
    };
  }
}
