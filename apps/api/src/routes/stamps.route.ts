/**
 * Routes tampons & récompenses
 * (montées sous /customers/:id pour garder la cohérence REST)
 *
 * POST /customers/:id/stamp  → ajouter 1 tampon au client
 * POST /customers/:id/redeem → consommer la récompense (reset compteur)
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { StampService } from "../services/stamp.service.js";

// ─── Schémas Zod ──────────────────────────────────────────────────────────────

const CustomerIdParams = z.object({
  id: z.string(),
});

const StampBody = z.object({
  program_id: z.string(),
  note: z.string().max(200).optional(),
});

const RedeemBody = z.object({
  program_id: z.string(),
  note: z.string().max(200).optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function stampsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  const stampService = new StampService();

  // POST /customers/:id/stamp
  // Ajoute 1 tampon. Retourne l'état mis à jour + flag reward_unlocked.
  app.post("/:id/stamp", async (request, reply) => {
    const params = CustomerIdParams.safeParse(request.params);
    const body = StampBody.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.status(400).send({ error: "ValidationError", message: "Paramètres invalides" });
    }

    const result = await stampService.addStamp(
      request.user.business_id,
      params.data.id,
      body.data.program_id,
      body.data.note
    );

    if (!result) {
      return reply.status(404).send({ error: "NotFound", message: "Client ou programme non trouvé" });
    }

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

    const result = await stampService.redeemReward(
      request.user.business_id,
      params.data.id,
      body.data.program_id,
      body.data.note
    );

    if (!result) {
      return reply.status(400).send({ error: "BadRequest", message: "Pas de récompense disponible ou client non trouvé" });
    }

    return reply.send(result);
  });
}
