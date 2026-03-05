/**
 * AiService
 *
 * Orchestrateur des jobs IA.
 * - Vérification des quotas mensuels par business/plan
 * - Mise en queue des jobs (BullMQ)
 * - Polling du statut d'un job
 *
 * Les quotas par plan :
 *   STARTER  : 20 générations/mois
 *   PRO      : 100 générations/mois
 *   BUSINESS : 300 générations/mois
 *
 * Les jobs sont traités dans src/workers/ai.worker.ts
 */

import { prisma, AiJobType } from "@loyalty/database";
import { getAiQueue } from "../lib/queue.js";

// Quotas par plan (clé = settings_json.plan du business)
const QUOTAS: Record<string, number> = {
  starter: 20,
  pro: 100,
  business: 300,
  // Fallback générique si pas de plan configuré
  default: 20,
};

interface EnqueueInput {
  type: "CLEAN_LOGO" | "GENERATE_PASS_DESIGN" | "GENERATE_PROMO_ASSETS";
  payload: Record<string, unknown>;
}

export class AiService {
  /**
   * Vérifie si le business a encore du quota IA ce mois.
   */
  async checkQuota(businessId: string): Promise<boolean> {
    const month = this.currentMonth();

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { settings_json: true },
    });

    const settings = (business?.settings_json ?? {}) as Record<string, unknown>;
    const plan = (settings["plan"] as string | undefined) ?? "default";
    const maxGenerations = QUOTAS[plan] ?? QUOTAS["default"]!;

    const counter = await prisma.usageCounter.findUnique({
      where: { business_id_month: { business_id: businessId, month } },
    });

    const used = counter?.ai_generations_count ?? 0;
    return used < maxGenerations;
  }

  /**
   * Enfile un job IA dans la queue BullMQ.
   * La table ai_jobs est créée en status PENDING avant l'enfilage.
   */
  async enqueue(businessId: string, userId: string, input: EnqueueInput) {
    const job = await prisma.aiJob.create({
      data: {
        business_id: businessId,
        user_id: userId,
        type: input.type as AiJobType,
        status: "PENDING",
        prompt: JSON.stringify(input.payload),
      },
    });

    // Envoyer à BullMQ pour traitement asynchrone
    const queue = getAiQueue();
    await queue.add(input.type, {
      jobId: job.id,
      businessId,
      payload: input.payload,
    });

    return job;
  }

  /**
   * Retourne l'état d'un job avec ses assets générés.
   */
  async getJob(businessId: string, jobId: string) {
    const job = await prisma.aiJob.findFirst({
      where: { id: jobId, business_id: businessId },
      include: { ai_assets: true },
    });

    if (!job) return null;

    return {
      id: job.id,
      type: job.type,
      status: job.status,
      assets: job.ai_assets.map((a) => ({ kind: a.kind, url: a.storage_url })),
      error_message: job.error_message,
      cost_estimate: job.cost_estimate,
      created_at: job.created_at.toISOString(),
      completed_at: job.completed_at?.toISOString() ?? null,
    };
  }

  /**
   * Retourne l'utilisation IA du mois courant pour un business.
   */
  async getUsage(businessId: string) {
    const month = this.currentMonth();

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { settings_json: true },
    });

    const settings = (business?.settings_json ?? {}) as Record<string, unknown>;
    const plan = (settings["plan"] as string | undefined) ?? "default";
    const maxGenerations = QUOTAS[plan] ?? QUOTAS["default"]!;

    const counter = await prisma.usageCounter.findUnique({
      where: { business_id_month: { business_id: businessId, month } },
    });

    return {
      month,
      plan,
      used: counter?.ai_generations_count ?? 0,
      limit: maxGenerations,
    };
  }

  /**
   * Retourne les 20 derniers jobs IA du business (pour l'historique).
   */
  async listJobs(businessId: string) {
    const jobs = await prisma.aiJob.findMany({
      where: { business_id: businessId },
      orderBy: { created_at: "desc" },
      take: 20,
      include: { ai_assets: true },
    });

    return jobs.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      assets: job.ai_assets.map((a) => ({ kind: a.kind, url: a.storage_url })),
      error_message: job.error_message,
      cost_estimate: job.cost_estimate,
      created_at: job.created_at.toISOString(),
      completed_at: job.completed_at?.toISOString() ?? null,
    }));
  }

  /**
   * Incrémente le compteur de générations IA (appelé par le worker après succès).
   */
  async incrementUsage(businessId: string, count = 1) {
    const month = this.currentMonth();

    await prisma.usageCounter.upsert({
      where: { business_id_month: { business_id: businessId, month } },
      create: {
        business_id: businessId,
        month,
        ai_generations_count: count,
      },
      update: {
        ai_generations_count: { increment: count },
      },
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private currentMonth(): string {
    return new Date().toISOString().slice(0, 7); // "YYYY-MM"
  }
}
