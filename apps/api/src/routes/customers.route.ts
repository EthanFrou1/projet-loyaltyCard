/**
 * Routes clients
 *
 * POST /customers          → créer un client + QR secret
 * GET  /customers          → liste avec recherche (nom / téléphone)
 * GET  /customers/:id      → détail client (compteurs + historique + passes wallet)
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CustomerService } from "../services/customer.service.js";

// ─── Schémas Zod ──────────────────────────────────────────────────────────────

const CreateCustomerBody = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().regex(/^\+?[\d\s\-()]{6,20}$/).optional(),
  email: z.string().email().optional(),
});

const SearchQuery = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
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
}
