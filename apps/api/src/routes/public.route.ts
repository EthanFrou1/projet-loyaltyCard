/**
 * Public routes - no authentication required.
 *
 * GET  /join/:slug           -> business info + active programs
 * POST /join/:slug?program_id=... -> register customer in selected program
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "@loyalty/database";

const SlugParams = z.object({
  slug: z.string().min(1),
});

const JoinQuery = z.object({
  program_id: z.string().min(1).optional(),
});

const RegisterBody = z.object({
  first_name: z.string().min(1).max(50),
  last_name: z.string().min(1).max(50),
  email: z.string().email(),
  phone: z.string().regex(/^\+?[\d\s\-()]{6,20}$/).optional(),
  program_id: z.string().min(1).optional(),
});

type ProgramConfig = {
  threshold?: number;
  reward_label?: string;
  background_color?: string;
  text_color?: "light" | "dark";
};

function extractProgramPreview(cfg: unknown): {
  threshold: number;
  reward_label: string;
  background_color: string | null;
  text_color: "light" | "dark";
} {
  const c = (cfg ?? {}) as ProgramConfig;
  return {
    threshold: c.threshold ?? 10,
    reward_label: c.reward_label ?? "Récompense",
    background_color: c.background_color ?? null,
    text_color: c.text_color ?? "light",
  };
}

export async function publicRoutes(app: FastifyInstance) {
  // GET /join/:slug - info for public sign-up page
  app.get("/:slug", async (request, reply) => {
    const params = SlugParams.safeParse(request.params);
    const query = JoinQuery.safeParse(request.query);
    if (!params.success) {
      return reply.status(400).send({ error: "BadRequest", message: "Slug invalide" });
    }
    if (!query.success) {
      return reply.status(400).send({ error: "BadRequest", message: "Paramètres invalides" });
    }

    const identifier = params.data.slug;
    const business = await prisma.business.findFirst({
      where: { OR: [{ id: identifier }, { slug: identifier }] },
      include: {
        programs: {
          where: { status: "ACTIVE" },
          orderBy: [{ version: "desc" }, { created_at: "desc" }],
          select: { id: true, name: true, type: true, config_json: true },
        },
      },
    });

    if (!business) {
      return reply.status(404).send({ error: "NotFound", message: "Établissement non trouvé" });
    }

    const allPrograms = business.programs.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      ...extractProgramPreview(p.config_json),
    }));

    const requestedProgramId = query.data.program_id;
    const programs = requestedProgramId
      ? allPrograms.filter((p) => p.id === requestedProgramId)
      : allPrograms;

    if (requestedProgramId && programs.length === 0) {
      return reply.status(404).send({ error: "NotFound", message: "Programme non trouvé pour cet établissement" });
    }

    const defaultProgram = programs[0] ?? null;

    return reply.send({
      name: business.name,
      logo_url: business.logo_url,
      slug: business.slug,
      threshold: defaultProgram?.threshold ?? 10,
      reward_label: defaultProgram?.reward_label ?? "Récompense",
      default_program_id: defaultProgram?.id ?? null,
      programs,
    });
  });

  // POST /join/:slug - register customer (or return existing one)
  app.post("/:slug", async (request, reply) => {
    const params = SlugParams.safeParse(request.params);
    const query = JoinQuery.safeParse(request.query);
    const body = RegisterBody.safeParse(request.body);

    if (!params.success || !query.success || !body.success) {
      return reply.status(400).send({ error: "ValidationError", message: "Données invalides" });
    }

    const id2 = params.data.slug;
    const business = await prisma.business.findFirst({
      where: { OR: [{ id: id2 }, { slug: id2 }] },
      select: { id: true },
    });

    if (!business) {
      return reply.status(404).send({ error: "NotFound", message: "Établissement non trouvé" });
    }

    const activePrograms = await prisma.program.findMany({
      where: { business_id: business.id, status: "ACTIVE" },
      orderBy: [{ version: "desc" }, { created_at: "desc" }],
      select: { id: true },
    });

    const activeProgramIds = new Set(activePrograms.map((p) => p.id));

    const chosenProgramId =
      body.data.program_id
      ?? query.data.program_id
      ?? activePrograms[0]?.id
      ?? null;

    if (chosenProgramId && !activeProgramIds.has(chosenProgramId)) {
      return reply.status(400).send({
        error: "ValidationError",
        message: "Programme invalide pour cet établissement.",
      });
    }

    const fullName = `${body.data.first_name} ${body.data.last_name}`.trim();

    const existingCustomer = await prisma.customer.findFirst({
      where: { business_id: business.id, email: body.data.email },
    });

    if (existingCustomer) {
      return reply.send({
        id: existingCustomer.id,
        name: existingCustomer.name,
        email: existingCustomer.email,
        stamp_count: existingCustomer.stamp_count,
        program_id: existingCustomer.program_id,
        already_registered: true,
      });
    }

    const qrSecret = crypto.randomBytes(32).toString("hex");

    const customer = await prisma.customer.create({
      data: {
        business_id: business.id,
        name: fullName,
        email: body.data.email,
        phone: body.data.phone,
        qr_secret: qrSecret,
        program_id: chosenProgramId,
      },
    });

    return reply.status(201).send({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      stamp_count: customer.stamp_count,
      program_id: customer.program_id,
      already_registered: false,
    });
  });
}

