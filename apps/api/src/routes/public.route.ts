/**
 * Routes publiques — sans authentification requise.
 *
 * Ces routes sont utilisées par les clients finaux depuis leur téléphone.
 *
 * GET  /join/:slug           → informations du business (nom, logo) pour la page d'inscription
 * POST /join/:slug           → inscrire un nouveau client et créer sa carte fidélité
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "@loyalty/database";

// ─── Schémas Zod ──────────────────────────────────────────────────────────────

const SlugParams = z.object({
  slug: z.string().min(1),
});

const RegisterBody = z.object({
  first_name: z.string().min(1).max(50),
  last_name:  z.string().min(1).max(50),
  email:      z.string().email(),
  phone:      z.string().regex(/^\+?[\d\s\-()]{6,20}$/).optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function publicRoutes(app: FastifyInstance) {

  // GET /join/:slug — infos du business pour afficher la page d'inscription
  app.get("/:slug", async (request, reply) => {
    const params = SlugParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "BadRequest", message: "Slug invalide" });
    }

    const business = await prisma.business.findFirst({
      where: { slug: params.data.slug },
      include: {
        programs: {
          where: { status: "ACTIVE" },
          orderBy: { version: "desc" },
          take: 1,
          select: { id: true, config_json: true },
        },
      },
    });

    if (!business) {
      return reply.status(404).send({ error: "NotFound", message: "Établissement non trouvé" });
    }

    const program = business.programs[0];
    const config = program?.config_json as { threshold?: number; reward_label?: string } | null;

    return reply.send({
      name:         business.name,
      logo_url:     business.logo_url,
      slug:         business.slug,
      threshold:    config?.threshold    ?? 10,
      reward_label: config?.reward_label ?? "Récompense",
    });
  });

  // POST /join/:slug — inscrire un client (crée ou retrouve depuis l'email)
  app.post("/:slug", async (request, reply) => {
    const params = SlugParams.safeParse(request.params);
    const body   = RegisterBody.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.status(400).send({ error: "ValidationError", message: "Données invalides" });
    }

    // Trouver le business par slug
    const business = await prisma.business.findFirst({
      where: { slug: params.data.slug },
    });

    if (!business) {
      return reply.status(404).send({ error: "NotFound", message: "Établissement non trouvé" });
    }

    const fullName = `${body.data.first_name} ${body.data.last_name}`.trim();

    // Si l'email existe déjà pour ce business → retourner le client existant
    const existingCustomer = await prisma.customer.findFirst({
      where: { business_id: business.id, email: body.data.email },
    });

    if (existingCustomer) {
      return reply.send({
        id:          existingCustomer.id,
        name:        existingCustomer.name,
        email:       existingCustomer.email,
        stamp_count: existingCustomer.stamp_count,
        already_registered: true,
      });
    }

    // Récupérer le programme actif pour l'inscrire dedans
    const activeProgram = await prisma.program.findFirst({
      where: { business_id: business.id, status: "ACTIVE" },
      orderBy: { version: "desc" },
    });

    // Créer le nouveau client en l'associant au programme actif
    const qrSecret = crypto.randomBytes(32).toString("hex");

    const customer = await prisma.customer.create({
      data: {
        business_id: business.id,
        name:        fullName,
        email:       body.data.email,
        phone:       body.data.phone,
        qr_secret:   qrSecret,
        program_id:  activeProgram?.id ?? null,
      },
    });

    return reply.status(201).send({
      id:          customer.id,
      name:        customer.name,
      email:       customer.email,
      stamp_count: customer.stamp_count,
      already_registered: false,
    });
  });
}
