/**
 * Routes business & programmes fidélité
 *
 * GET    /business              → détail du business de l'utilisateur connecté
 * GET    /business/stats        → stats dashboard (clients, tampons aujourd'hui, récompenses ce mois)
 * PATCH  /business              → mettre à jour nom, logo, settings
 * POST   /business/logo         → upload du logo (multipart/form-data)
 * POST   /business/programs     → créer un programme fidélité
 * GET    /business/programs     → liste des programmes
 * PATCH  /business/programs/:id → modifier un programme
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@loyalty/database";
import { StorageService } from "../lib/storage.js";

// ─── Schémas Zod ──────────────────────────────────────────────────────────────

const UpdateBusinessBody = z.object({
  name: z.string().min(2).optional(),
  logo_url: z.string().url().optional(),
  settings_json: z.record(z.unknown()).optional(),
});

const CreateProgramBody = z.object({
  name: z.string().min(2),
  type: z.enum(["STAMPS", "POINTS"]),
  config: z.record(z.unknown()), // validé plus finement dans le service
});

const ProgramIdParams = z.object({
  id: z.string().cuid(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function businessRoutes(app: FastifyInstance) {
  // Toutes ces routes nécessitent une authentification
  app.addHook("preHandler", app.authenticate);

  // GET /business/stats — stats pour le tableau de bord
  app.get("/stats", async (request, reply) => {
    const businessId = request.user.business_id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [customersTotal, stampsToday, rewardsThisMonth] = await prisma.$transaction([
      prisma.customer.count({
        where: { business_id: businessId },
      }),
      prisma.transaction.count({
        where: {
          customer: { business_id: businessId },
          type: "STAMP_ADD",
          created_at: { gte: today },
        },
      }),
      prisma.transaction.count({
        where: {
          customer: { business_id: businessId },
          type: "STAMP_REDEEM",
          created_at: { gte: firstOfMonth },
        },
      }),
    ]);

    return reply.send({
      customers_total: customersTotal,
      stamps_today: stampsToday,
      rewards_this_month: rewardsThisMonth,
    });
  });

  // GET /business
  app.get("/", async (request, reply) => {
    const business = await prisma.business.findUnique({
      where: { id: request.user.business_id },
      include: {
        programs: {
          orderBy: { version: "desc" },
        },
      },
    });

    if (!business) {
      return reply.status(404).send({ error: "NotFound", message: "Business non trouvé" });
    }

    return reply.send(business);
  });

  // POST /business/logo — upload du logo via multipart/form-data
  app.post("/logo", async (request, reply) => {
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/svg+xml", "image/webp"];
    const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 Mo

    let file;
    try {
      file = await request.file();
    } catch {
      return reply.status(400).send({ error: "BadRequest", message: "Fichier manquant dans la requête." });
    }

    if (!file) {
      return reply.status(400).send({ error: "BadRequest", message: "Aucun fichier reçu." });
    }

    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return reply.status(400).send({
        error: "BadRequest",
        message: "Format non supporté. Utilisez JPG, PNG, SVG ou WEBP.",
      });
    }

    const buffer = await file.toBuffer();

    if (buffer.length > MAX_SIZE_BYTES) {
      return reply.status(400).send({
        error: "BadRequest",
        message: "Fichier trop volumineux (max 2 Mo).",
      });
    }

    // Choisir l'extension selon le type MIME
    const extMap: Record<string, string> = {
      "image/jpeg":   "jpg",
      "image/png":    "png",
      "image/svg+xml":"svg",
      "image/webp":   "webp",
    };
    const ext = extMap[file.mimetype];
    const key = `logos/${request.user.business_id}/logo.${ext}`;

    try {
      const storage = new StorageService();
      const logoUrl = await storage.upload(buffer, key, file.mimetype);

      // Mettre à jour l'URL du logo en base
      const updated = await prisma.business.update({
        where: { id: request.user.business_id },
        data:  { logo_url: logoUrl },
      });

      return reply.send({ logo_url: updated.logo_url });
    } catch (err) {
      request.log.error(err, "Erreur upload logo");
      return reply.status(500).send({
        error: "StorageError",
        message: "Impossible d'uploader le logo. Vérifiez la configuration R2.",
      });
    }
  });

  // PATCH /business
  app.patch("/", async (request, reply) => {
    const body = UpdateBusinessBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    const updated = await prisma.business.update({
      where: { id: request.user.business_id },
      data: body.data,
    });

    return reply.send(updated);
  });

  // POST /business/programs
  // Gating par plan : Starter=1, Pro=3, Business=illimité
  app.post("/programs", async (request, reply) => {
    const body = CreateProgramBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    const PLAN_LIMITS: Record<string, number> = { STARTER: 1, PRO: 3, BUSINESS: Infinity };

    // Vérifier le plan et le nombre de programmes actifs
    const business = await prisma.business.findUnique({
      where: { id: request.user.business_id },
      include: { programs: { where: { status: "ACTIVE" } } },
    });

    if (!business) {
      return reply.status(404).send({ error: "NotFound", message: "Business non trouvé" });
    }

    const limit = PLAN_LIMITS[business.plan] ?? 1;
    if (business.programs.length >= limit) {
      return reply.status(403).send({
        error: "PlanLimitReached",
        message: `Votre plan ${business.plan} est limité à ${limit} programme(s) actif(s). Passez au plan supérieur pour en ajouter d'autres.`,
      });
    }

    const program = await prisma.program.create({
      data: {
        business_id: request.user.business_id,
        name: body.data.name,
        type: body.data.type,
        config_json: body.data.config,
        status: "ACTIVE",
        version: 1,
      },
    });

    return reply.status(201).send(program);
  });

  // GET /business/programs
  app.get("/programs", async (request, reply) => {
    const programs = await prisma.program.findMany({
      where: { business_id: request.user.business_id },
      orderBy: { created_at: "desc" },
    });

    return reply.send(programs);
  });

  // PATCH /business/programs/:id
  // Versioning : archive l'ancienne version et crée une nouvelle version active.
  // Les clients existants gardent leur program_id → continueront avec l'ancien seuil.
  app.patch("/programs/:id", async (request, reply) => {
    const params = ProgramIdParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "ValidationError", message: "ID invalide" });
    }

    const body = CreateProgramBody.partial().safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    // Vérifier que le programme appartient bien à ce business
    const existing = await prisma.program.findFirst({
      where: { id: params.data.id, business_id: request.user.business_id, status: "ACTIVE" },
    });

    if (!existing) {
      return reply.status(404).send({ error: "NotFound", message: "Programme actif non trouvé" });
    }

    // Archiver l'ancienne version + créer la nouvelle en une transaction atomique
    const [archived, newProgram] = await prisma.$transaction([
      prisma.program.update({
        where: { id: existing.id },
        data: { status: "ARCHIVED" },
      }),
      prisma.program.create({
        data: {
          business_id: request.user.business_id,
          name: body.data.name ?? existing.name,
          type: body.data.type ?? existing.type,
          config_json: body.data.config ?? existing.config_json,
          version: existing.version + 1,
          status: "ACTIVE",
        },
      }),
    ]);

    return reply.send({ archived, active: newProgram });
  });
}
