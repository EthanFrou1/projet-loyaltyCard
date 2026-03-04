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

// ─── Types Google Places ──────────────────────────────────────────────────────

// Correspondance types Google → nos types d'établissement
const GOOGLE_TYPE_MAP: Record<string, string> = {
  hair_care:       "salon_coiffure",
  beauty_salon:    "institut_beaute",
  spa:             "spa",
  nail_salon:      "onglerie",
  restaurant:      "restaurant",
  cafe:            "cafe",
  bakery:          "cafe",
  bar:             "cafe",
  store:           "boutique",
  clothing_store:  "boutique",
  shopping_mall:   "boutique",
};

function mapGoogleType(types: string[]): string {
  for (const t of types) {
    if (GOOGLE_TYPE_MAP[t]) return GOOGLE_TYPE_MAP[t];
  }
  return "autre";
}

function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function buildUniqueBusinessSlug(name: string, businessId: string): Promise<string> {
  const base = toSlug(name) || `etablissement-${Date.now()}`;
  let candidate = base;
  let suffix = 2;

  while (true) {
    const conflict = await prisma.business.findFirst({
      where: {
        slug: candidate,
        NOT: { id: businessId },
      },
      select: { id: true },
    });

    if (!conflict) {
      return candidate;
    }

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

// ─── Schémas Zod ──────────────────────────────────────────────────────────────

const UpdateBusinessBody = z.object({
  name: z.string().min(2).optional(),
  logo_url: z.string().url().optional(),
  settings_json: z.record(z.unknown()).optional(),
  // Force la régénération du slug depuis le nom actuel (utile si le slug est obsolète)
  regenerate_slug: z.boolean().optional(),
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

  // GET /business/places/search?query=... — recherche Google Places
  app.get("/places/search", async (request, reply) => {
    const { query } = request.query as { query?: string };
    if (!query || query.trim().length < 2) {
      return reply.status(400).send({ error: "BadRequest", message: "Requête trop courte" });
    }

    const apiKey = process.env["GOOGLE_PLACES_API_KEY"];
    if (!apiKey) {
      return reply.status(503).send({ error: "NotConfigured", message: "Clé Google Places manquante" });
    }

    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&type=establishment&language=fr&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json() as { results: Array<{ place_id: string; name: string; formatted_address: string; types: string[] }> };

    const results = (data.results ?? []).slice(0, 6).map((r) => ({
      place_id:  r.place_id,
      name:      r.name,
      address:   r.formatted_address,
      type:      mapGoogleType(r.types ?? []),
    }));

    return reply.send(results);
  });

  // GET /business/places/details?place_id=... — détails complets d'un lieu
  app.get("/places/details", async (request, reply) => {
    const { place_id } = request.query as { place_id?: string };
    if (!place_id) {
      return reply.status(400).send({ error: "BadRequest", message: "place_id manquant" });
    }

    const apiKey = process.env["GOOGLE_PLACES_API_KEY"];
    if (!apiKey) {
      return reply.status(503).send({ error: "NotConfigured", message: "Clé Google Places manquante" });
    }

    const fields = "name,formatted_address,formatted_phone_number,types,photos,website";
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=${fields}&language=fr&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json() as { result: Record<string, unknown> };
    const r = data.result as {
      name?: string;
      formatted_address?: string;
      formatted_phone_number?: string;
      types?: string[];
      photos?: Array<{ photo_reference: string }>;
      website?: string;
    };

    // Proxy jusqu'à 5 photos en parallèle — Google redirige vers l'URL CDN réelle
    const photoRefs = (r.photos ?? []).slice(0, 5).map((p) => p.photo_reference);
    const settled = await Promise.allSettled(
      photoRefs.map((ref) =>
        fetch(`https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${apiKey}`)
          .then((pr) => (pr.ok && pr.url ? pr.url : null))
          .catch(() => null)
      )
    );
    const photo_urls = settled
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter((u): u is string => u !== null);

    return reply.send({
      name:       r.name ?? null,
      address:    r.formatted_address ?? null,
      phone:      r.formatted_phone_number ?? null,
      type:       mapGoogleType(r.types ?? []),
      website:    r.website ?? null,
      photo_urls, // tableau d'URLs CDN Google (jusqu'à 5)
    });
  });

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

    const current = await prisma.business.findUnique({
      where: { id: request.user.business_id },
      select: { id: true, name: true, name_locked: true },
    });

    if (!current) {
      return reply.status(404).send({ error: "NotFound", message: "Business non trouvé" });
    }

    const { regenerate_slug, ...restData } = body.data;
    const updateData: Record<string, unknown> = { ...restData };
    const incomingName = typeof body.data.name === "string" ? body.data.name.trim() : undefined;

    if (incomingName !== undefined) {
      if (incomingName.length < 2) {
        return reply.status(400).send({
          error: "ValidationError",
          message: "Le nom doit faire au moins 2 caractères.",
        });
      }

      // Bloquer le changement si le nom est verrouillé
      if (current.name_locked) {
        return reply.status(403).send({
          error: "NameLocked",
          message: "Le nom de l'établissement est verrouillé. Contactez le support pour le modifier.",
        });
      }

      updateData.name = incomingName;
      updateData.slug = await buildUniqueBusinessSlug(incomingName, current.id);
      updateData.name_locked = true; // verrouiller dès la 1ère sauvegarde réelle
    } else if (regenerate_slug) {
      // Régénérer le slug depuis le nom actuel sans changer le nom
      updateData.slug = await buildUniqueBusinessSlug(current.name, current.id);
    }

    const updated = await prisma.business.update({
      where: { id: request.user.business_id },
      data: updateData,
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

  // GET /business/programs/:id/stats — clients inscrits, tampons, récompenses
  app.get("/programs/:id/stats", async (request, reply) => {
    const params = ProgramIdParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "ValidationError", message: "ID invalide" });
    }

    const businessId = request.user.business_id;
    const programId  = params.data.id;

    const program = await prisma.program.findFirst({
      where: { id: programId, business_id: businessId },
    });

    if (!program) {
      return reply.status(404).send({ error: "NotFound", message: "Programme non trouvé" });
    }

    const [clients, stamps, rewards] = await prisma.$transaction([
      prisma.customer.count({
        where: { business_id: businessId, program_id: programId },
      }),
      prisma.transaction.count({
        where: {
          customer: { business_id: businessId, program_id: programId },
          type: "STAMP_ADD",
        },
      }),
      prisma.transaction.count({
        where: {
          customer: { business_id: businessId, program_id: programId },
          type: "STAMP_REDEEM",
        },
      }),
    ]);

    return reply.send({ clients, stamps, rewards });
  });

  // GET /business/programs
  app.get("/programs", async (request, reply) => {
    const programs = await prisma.program.findMany({
      where: { business_id: request.user.business_id },
      orderBy: { created_at: "desc" },
    });

    return reply.send(programs);
  });

  // PATCH /business/programs/:id/design — design uniquement, sans versioning
  // Mise à jour des champs visuels (couleur fond, texte) sans créer de nouvelle version.
  app.patch("/programs/:id/design", async (request, reply) => {
    const params = ProgramIdParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "ValidationError", message: "ID invalide" });
    }

    const body = z.object({
      background_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      text_color: z.enum(["light", "dark"]).optional(),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    const program = await prisma.program.findFirst({
      where: { id: params.data.id, business_id: request.user.business_id, status: "ACTIVE" },
    });

    if (!program) {
      return reply.status(404).send({ error: "NotFound", message: "Programme actif non trouvé" });
    }

    const updated = await prisma.program.update({
      where: { id: program.id },
      data: {
        config_json: {
          ...((program.config_json as object) ?? {}),
          ...body.data,
        },
      },
    });

    return reply.send(updated);
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
