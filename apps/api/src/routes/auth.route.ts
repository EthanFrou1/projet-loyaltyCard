/**
 * Routes d'authentification
 *
 * POST  /auth/setup             → créer le premier admin (uniquement si aucun user en base)
 * POST  /auth/login             → connexion (retourne access + refresh token)
 * POST  /auth/refresh           → rafraîchir l'access token
 * POST  /auth/logout            → invalider le refresh token (côté client)
 * GET   /auth/me                → profil de l'utilisateur connecté
 * PATCH /auth/me/password       → changer le mot de passe
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@loyalty/database";
import { AuthService } from "../services/auth.service.js";

// ─── Schémas de validation Zod ────────────────────────────────────────────────

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const RefreshBody = z.object({
  refresh_token: z.string(),
});

const SetupBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  business_name: z.string().min(2),
});

const ChangePasswordBody = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService();

  // POST /auth/setup — créer le 1er business + admin (bloqué si déjà des users)
  app.post("/setup", async (request, reply) => {
    const body = SetupBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    try {
      // Sécurité : endpoint désactivé si des utilisateurs existent déjà
      const existingUsers = await prisma.user.count();
      if (existingUsers > 0) {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Setup déjà effectué. Un administrateur existe déjà.",
        });
      }

      // Créer le business
      const slug = body.data.business_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const business = await prisma.business.create({
        data: {
          name: body.data.business_name,
          slug: `${slug}-${Date.now()}`,
          settings_json: { plan: "pro" },
        },
      });

      // Créer le programme fidélité par défaut
      await prisma.program.create({
        data: {
          business_id: business.id,
          name: "Carte fidélité",
          type: "STAMPS",
          config_json: { threshold: 10, reward_label: "10€ de réduction" },
          status: "ACTIVE",
          version: 1,
        },
      });

      // Créer l'utilisateur admin
      const password_hash = await authService.hashPassword(body.data.password);
      await prisma.user.create({
        data: {
          email: body.data.email,
          password_hash,
          role: "ADMIN",
          business_id: business.id,
        },
      });

      // Connecter directement après le setup
      const result = await authService.login(body.data.email, body.data.password);
      return reply.status(201).send(result);
    } catch (err) {
      request.log.error(err, "Erreur setup");
      return reply.status(500).send({
        error: "InternalServerError",
        message: String(err instanceof Error ? err.message : err),
      });
    }
  });

  // POST /auth/login
  app.post("/login", async (request, reply) => {
    const body = LoginBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    try {
      const result = await authService.login(body.data.email, body.data.password);
      if (!result) {
        return reply.status(401).send({ error: "Unauthorized", message: "Email ou mot de passe incorrect" });
      }
      return reply.send(result);
    } catch (err) {
      request.log.error(err, "Erreur login");
      return reply.status(500).send({ error: "InternalServerError", message: "Erreur serveur, réessayez." });
    }
  });

  // POST /auth/refresh
  app.post("/refresh", async (request, reply) => {
    const body = RefreshBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    const result = await authService.refreshToken(body.data.refresh_token);
    if (!result) {
      return reply.status(401).send({ error: "Unauthorized", message: "Refresh token invalide" });
    }

    return reply.send(result);
  });

  // POST /auth/logout (le client supprime ses tokens côté front)
  app.post("/logout", { preHandler: [app.authenticate] }, async (request, reply) => {
    // TODO: blacklister le refresh token en base (optionnel pour MVP)
    return reply.send({ success: true });
  });

  // GET /auth/me
  app.get("/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const user = await authService.getMe(request.user.sub);
      if (!user) {
        return reply.status(404).send({ error: "NotFound", message: "Utilisateur non trouvé" });
      }
      return reply.send(user);
    } catch (err) {
      request.log.error(err, "Erreur getMe");
      return reply.status(500).send({ error: "InternalServerError", message: "Erreur serveur." });
    }
  });

  // PATCH /auth/me/password — changer le mot de passe
  app.patch("/me/password", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = ChangePasswordBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
      if (!user) {
        return reply.status(404).send({ error: "NotFound", message: "Utilisateur non trouvé" });
      }

      // Vérifier l'ancien mot de passe
      const valid = await authService.verifyPassword(body.data.current_password, user.password_hash);
      if (!valid) {
        return reply.status(401).send({ error: "Unauthorized", message: "Mot de passe actuel incorrect." });
      }

      // Hacher et enregistrer le nouveau mot de passe
      const newHash = await authService.hashPassword(body.data.new_password);
      await prisma.user.update({
        where: { id: request.user.sub },
        data: { password_hash: newHash },
      });

      return reply.send({ success: true });
    } catch (err) {
      request.log.error(err, "Erreur changePassword");
      return reply.status(500).send({ error: "InternalServerError", message: "Erreur serveur." });
    }
  });
}
