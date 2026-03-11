/**
 * Routes clients
 *
 * POST /customers          → créer un client + QR secret
 * GET  /customers          → liste avec recherche (nom / téléphone)
 * GET  /customers/:id      → détail client (compteurs + historique + passes wallet)
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@loyalty/database";
import { CustomerService } from "../services/customer.service.js";

// ─── Schémas Zod ──────────────────────────────────────────────────────────────

const CreateCustomerBody = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().regex(/^\d{10}$/),
  email: z.string().email(),
});
const UpdateCustomerBody = CreateCustomerBody;

const SearchQuery = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(10),
});

const CustomerIdParams = z.object({
  id: z.string(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function customerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  const customerService = new CustomerService();

  // POST /customers
  app.post("/", async (request, reply) => {
    const body = CreateCustomerBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    const activeProgram = await prisma.program.findFirst({
      where: { business_id: request.user.business_id, status: "ACTIVE" },
      select: { id: true },
    });
    if (!activeProgram) {
      return reply.status(409).send({
        error: "BusinessSetupRequired",
        code: "BUSINESS_SETUP_REQUIRED",
        message: "Aucun programme actif. Créez d'abord votre premier programme de fidélité.",
        required_step: "first_program",
      });
    }

    try {
      const customer = await customerService.create(request.user.business_id, body.data);
      return reply.status(201).send(customer);
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === "EMAIL_TAKEN") {
        return reply.status(409).send({ error: "Conflict", message: err.message });
      }
      throw err;
    }
  });

  // GET /customers?search=Marie&page=1&per_page=20
  app.get("/", async (request, reply) => {
    const query = SearchQuery.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: "ValidationError", message: query.error.message });
    }

    const result = await customerService.list(request.user.business_id, query.data);
    return reply.send(result);
  });

  // GET /customers/:id
  app.get("/:id", async (request, reply) => {
    const params = CustomerIdParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "ValidationError", message: "ID invalide" });
    }

    const customer = await customerService.getById(request.user.business_id, params.data.id);
    if (!customer) {
      return reply.status(404).send({ error: "NotFound", message: "Client non trouvé" });
    }

    return reply.send(customer);
  });

  // PATCH /customers/:id
  app.patch("/:id", async (request, reply) => {
    const params = CustomerIdParams.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "ValidationError", message: "ID invalide" });
    }

    const body = UpdateCustomerBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    try {
      const customer = await customerService.update(request.user.business_id, params.data.id, body.data);
      if (!customer) {
        return reply.status(404).send({ error: "NotFound", message: "Client non trouvé" });
      }
      return reply.send(customer);
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === "EMAIL_TAKEN") {
        return reply.status(409).send({ error: "Conflict", message: err.message });
      }
      throw err;
    }
  });
}
