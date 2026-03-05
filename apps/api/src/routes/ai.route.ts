/**
 * Routes IA asynchrones
 *
 * Les jobs sont traités en queue (BullMQ) pour ne pas bloquer la requête HTTP.
 * Le client poll GET /ai/jobs/:id pour suivre le statut.
 *
 * POST /ai/upload-logo           → upload un fichier logo sur R2, retourne l'URL
 * POST /ai/clean-logo            → nettoyer/améliorer un logo (via gpt-image-1)
 * POST /ai/generate-pass-design  → générer 3 variantes de design de carte
 * POST /ai/generate-promo-assets → générer des assets promotionnels
 * GET  /ai/jobs                  → liste des derniers jobs du business
 * GET  /ai/jobs/:id              → statut + résultats d'un job
 * GET  /ai/usage                 → quota consommé ce mois
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AiService } from "../services/ai.service.js";
import { StorageService } from "../lib/storage.js";

// ─── Schémas Zod ──────────────────────────────────────────────────────────────

const CleanLogoBody = z.object({
  source_url: z.string().url(),
  instructions: z.string().max(200).optional(),
});

const GeneratePassDesignBody = z.object({
  style_prompt: z.string().min(5).max(300),
  variants: z.number().int().min(1).max(3).default(3),
});

const GeneratePromoAssetsBody = z.object({
  promo_text: z.string().min(5).max(200),
  logo_url: z.string().url().optional(),
  assets: z
    .array(z.enum(["story_ig", "poster_a4", "coupon"]))
    .min(1)
    .max(3),
});

const JobIdParams = z.object({
  id: z.string(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function aiRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  const aiService = new AiService();
  const storageService = new StorageService();

  // POST /ai/upload-logo — upload multipart d'un logo sur R2, retourne l'URL publique
  app.post("/upload-logo", async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "ValidationError", message: "Aucun fichier reçu" });
    }

    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(data.mimetype)) {
      return reply.status(400).send({ error: "ValidationError", message: "Format non supporté. PNG, JPEG, WEBP ou SVG uniquement." });
    }

    const buffer = await data.toBuffer();
    const ext = data.mimetype.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const key = `logos/${request.user.business_id}/original.${ext}`;

    const url = await storageService.upload(buffer, key, data.mimetype);
    return reply.send({ url });
  });

  // POST /ai/clean-logo
  app.post("/clean-logo", async (request, reply) => {
    const body = CleanLogoBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    // Vérifier le quota avant de créer le job
    const quotaOk = await aiService.checkQuota(request.user.business_id);
    if (!quotaOk) {
      return reply.status(429).send({
        error: "QuotaExceeded",
        message: "Quota IA mensuel atteint. Passez à un plan supérieur ou achetez des crédits.",
      });
    }

    const job = await aiService.enqueue(request.user.business_id, request.user.sub, {
      type: "CLEAN_LOGO",
      payload: body.data,
    });

    return reply.status(202).send({ job_id: job.id, status: "PENDING" });
  });

  // POST /ai/generate-pass-design
  app.post("/generate-pass-design", async (request, reply) => {
    const body = GeneratePassDesignBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    const quotaOk = await aiService.checkQuota(request.user.business_id);
    if (!quotaOk) {
      return reply.status(429).send({ error: "QuotaExceeded", message: "Quota IA mensuel atteint." });
    }

    const job = await aiService.enqueue(request.user.business_id, request.user.sub, {
      type: "GENERATE_PASS_DESIGN",
      payload: body.data,
    });

    return reply.status(202).send({ job_id: job.id, status: "PENDING" });
  });

  // POST /ai/generate-promo-assets
  app.post("/generate-promo-assets", async (request, reply) => {
    const body = GeneratePromoAssetsBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    const quotaOk = await aiService.checkQuota(request.user.business_id);
    if (!quotaOk) {
      return reply.status(429).send({ error: "QuotaExceeded", message: "Quota IA mensuel atteint." });
    }

    const job = await aiService.enqueue(request.user.business_id, request.user.sub, {
      type: "GENERATE_PROMO_ASSETS",
      payload: body.data,
    });

    return reply.status(202).send({ job_id: job.id, status: "PENDING" });
  });

  // GET /ai/jobs — liste des 20 derniers jobs du business
  app.get("/jobs", async (request, reply) => {
    const jobs = await aiService.listJobs(request.user.business_id);
    return reply.send(jobs);
  });

  // GET /ai/jobs/:id — polling du statut
  app.get("/jobs/:id", async (request, reply) => {
    const params = JobIdParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "ValidationError" });
    }

    const job = await aiService.getJob(request.user.business_id, params.data.id);
    if (!job) {
      return reply.status(404).send({ error: "NotFound", message: "Job non trouvé" });
    }

    return reply.send(job);
  });

  // GET /ai/usage — quota consommé ce mois
  app.get("/usage", async (request, reply) => {
    const usage = await aiService.getUsage(request.user.business_id);
    return reply.send(usage);
  });
}
