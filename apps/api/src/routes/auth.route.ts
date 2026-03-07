/**
 * Routes d'authentification
 *
 * POST  /auth/setup             → créer un compte admin + business (email unique requis)
 * POST  /auth/login             → connexion (retourne access + refresh token)
 * POST  /auth/refresh           → rafraîchir l'access token
 * POST  /auth/logout            → invalider le refresh token (côté client)
 * GET   /auth/me                → profil de l'utilisateur connecté
 * PATCH /auth/me/password       → changer le mot de passe
 * GET   /auth/team              → lister les comptes du salon (owner)
 * POST  /auth/team              → créer un compte staff (owner)
 * DELETE /auth/team/:id         → supprimer un compte staff (owner)
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
  business_name: z.string().min(2).optional(),
});

const ChangePasswordBody = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

const CreateTeamMemberBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["STAFF"]).default("STAFF"),
});

const TeamMemberParams = z.object({
  id: z.string().min(1),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService();

  // POST /auth/setup — créer un nouveau business + admin (un par adresse email)
  app.post("/setup", async (request, reply) => {
    const body = SetupBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    try {
      // Vérifier que l'email n'est pas déjà utilisé
      const existingUser = await prisma.user.findUnique({ where: { email: body.data.email } });
      if (existingUser) {
        return reply.status(409).send({
          error: "Conflict",
          message: "Cette adresse email est déjà utilisée.",
        });
      }

      // Créer le business vide — l'utilisateur le configure dans l'onboarding
      const business = await prisma.business.create({
        data: {
          name: "",
          slug: `business-${Date.now()}`,
          settings_json: { plan: "pro" },
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

  // GET /auth/team
  app.get("/team", { preHandler: [app.authenticate, app.requireOwner] }, async (request, reply) => {
    const users = await prisma.user.findMany({
      where: { business_id: request.user.business_id },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        email: true,
        role: true,
        created_at: true,
      },
    });

    return reply.send(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role === "ADMIN" ? "OWNER" : "STAFF",
        created_at: u.created_at.toISOString(),
      }))
    );
  });

  // POST /auth/team
  app.post("/team", { preHandler: [app.authenticate, app.requireOwner] }, async (request, reply) => {
    const body = CreateTeamMemberBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: body.data.email },
      select: { id: true, business_id: true },
    });

    if (existingUser) {
      return reply.status(409).send({
        error: "Conflict",
        message: "Cette adresse email est deja utilisee.",
      });
    }

    const password_hash = await authService.hashPassword(body.data.password);
    const created = await prisma.user.create({
      data: {
        email: body.data.email,
        password_hash,
        role: "EMPLOYEE",
        business_id: request.user.business_id,
      },
      select: { id: true, email: true, role: true, created_at: true },
    });

    return reply.status(201).send({
      id: created.id,
      email: created.email,
      role: created.role === "ADMIN" ? "OWNER" : "STAFF",
      created_at: created.created_at.toISOString(),
    });
  });

  // DELETE /auth/team/:id
  app.delete("/team/:id", { preHandler: [app.authenticate, app.requireOwner] }, async (request, reply) => {
    const params = TeamMemberParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "ValidationError", message: "ID invalide" });
    }

    if (params.data.id === request.user.sub) {
      return reply.status(400).send({
        error: "BadRequest",
        message: "Vous ne pouvez pas supprimer votre propre compte.",
      });
    }

    const target = await prisma.user.findFirst({
      where: { id: params.data.id, business_id: request.user.business_id },
      select: { id: true, role: true },
    });
    if (!target) {
      return reply.status(404).send({ error: "NotFound", message: "Utilisateur non trouve." });
    }
    if (target.role === "ADMIN") {
      return reply.status(403).send({
        error: "Forbidden",
        message: "Impossible de supprimer un proprietaire.",
      });
    }

    await prisma.user.delete({ where: { id: target.id } });
    return reply.send({ success: true });
  });
}
