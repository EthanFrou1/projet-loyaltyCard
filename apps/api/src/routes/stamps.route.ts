/**
 * Routes tampons & récompenses
 * (montées sous /customers/:id pour garder la cohérence REST)
 *
 * POST /customers/:id/stamp  → ajouter 1 tampon au client
 * POST /customers/:id/redeem → consommer la récompense (reset compteur)
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@loyalty/database";
import { StampService } from "../services/stamp.service.js";

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    return user?.email ?? null;
  } catch {
    return null;
  }
}
import { GoogleWalletService } from "../services/wallet-google.service.js";
import { AppleWalletService } from "../services/wallet-apple.service.js";

// ─── Schémas Zod ──────────────────────────────────────────────────────────────

const CustomerIdParams = z.object({
  id: z.string(),
});

const StampBody = z.object({
  program_id: z.string(),
  note: z.string().max(200).optional(),
  source: z.enum(["PAGE_CLIENT", "QR_SCAN", "API"]).optional(),
});

const RedeemBody = z.object({
  program_id: z.string(),
  note: z.string().max(200).optional(),
  source: z.enum(["PAGE_CLIENT", "QR_SCAN", "API"]).optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function stampsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  const stampService = new StampService();
  const googleWalletService = new GoogleWalletService();
  const appleWalletService = new AppleWalletService();

  async function ensureBusinessHasActiveProgram(businessId: string) {
    const activeProgram = await prisma.program.findFirst({
      where: { business_id: businessId, status: "ACTIVE" },
      select: { id: true },
    });
    return Boolean(activeProgram);
  }

  // POST /customers/:id/stamp
  // Ajoute 1 tampon. Retourne l'état mis à jour + flag reward_unlocked.
  app.post("/:id/stamp", async (request, reply) => {
    const params = CustomerIdParams.safeParse(request.params);
    const body = StampBody.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.status(400).send({ error: "ValidationError", message: "Paramètres invalides" });
    }

    const hasActiveProgram = await ensureBusinessHasActiveProgram(request.user.business_id);
    if (!hasActiveProgram) {
      return reply.status(409).send({
        error: "BusinessSetupRequired",
        code: "BUSINESS_SETUP_REQUIRED",
        message: "Aucun programme actif. Créez d'abord votre premier programme de fidélité.",
        required_step: "first_program",
      });
    }

    const performedByName = await getUserEmail(request.user.sub);
    const result = await stampService.addStamp(
      request.user.business_id,
      params.data.id,
      body.data.program_id,
      body.data.note,
      body.data.source ?? "PAGE_CLIENT",
      performedByName ?? undefined
    );

    if (!result) {
      return reply.status(404).send({ error: "NotFound", message: "Client ou programme non trouvé" });
    }

    await Promise.allSettled([
      googleWalletService.updateObject(request.user.business_id, params.data.id),
      appleWalletService.refreshPassIfExists(request.user.business_id, params.data.id),
    ]);

    return reply.send(result);
  });

  // POST /customers/:id/redeem
  // Consomme la récompense + remet le compteur à 0.
  app.post("/:id/redeem", async (request, reply) => {
    const params = CustomerIdParams.safeParse(request.params);
    const body = RedeemBody.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.status(400).send({ error: "ValidationError", message: "Paramètres invalides" });
    }

    const hasActiveProgram = await ensureBusinessHasActiveProgram(request.user.business_id);
    if (!hasActiveProgram) {
      return reply.status(409).send({
        error: "BusinessSetupRequired",
        code: "BUSINESS_SETUP_REQUIRED",
        message: "Aucun programme actif. Créez d'abord votre premier programme de fidélité.",
        required_step: "first_program",
      });
    }

    const performedByName = await getUserEmail(request.user.sub);
    const result = await stampService.redeemReward(
      request.user.business_id,
      params.data.id,
      body.data.program_id,
      body.data.note,
      body.data.source ?? "PAGE_CLIENT",
      performedByName ?? undefined
    );

    if (!result) {
      return reply.status(400).send({ error: "BadRequest", message: "Pas de récompense disponible ou client non trouvé" });
    }

    await Promise.allSettled([
      googleWalletService.updateObject(request.user.business_id, params.data.id),
      appleWalletService.refreshPassIfExists(request.user.business_id, params.data.id),
    ]);

    return reply.send(result);
  });
}
