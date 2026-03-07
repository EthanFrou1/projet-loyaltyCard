/**
 * Routes Wallet (Apple + Google)
 *
 * ─── Google Wallet ─────────────────────────────────────────────────────────
 * POST /wallet/google/:customerId/jwt     → JWT "Add to Google Wallet"
 * POST /wallet/google/:customerId/update  → mettre à jour l'objet fidélité
 *
 * ─── Apple Wallet ──────────────────────────────────────────────────────────
 * POST /wallet/apple/:customerId/create   → générer le .pkpass
 * GET  /wallet/apple/:customerId/download → télécharger le .pkpass
 *
 * ─── Apple PassKit Web Service (appelé par iOS, pas par le dashboard) ──────
 * POST   /wallet/apple/devices/:deviceId/registrations/:passTypeId/:serial
 * DELETE /wallet/apple/devices/:deviceId/registrations/:passTypeId/:serial
 * GET    /wallet/apple/devices/:deviceId/registrations/:passTypeId
 * GET    /wallet/apple/passes/:passTypeId/:serial
 * POST   /wallet/apple/log
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { GoogleWalletService } from "../services/wallet-google.service.js";
import { AppleWalletService } from "../services/wallet-apple.service.js";

const CustomerIdParams = z.object({ customerId: z.string() });
const DeviceParams = z.object({
  deviceId: z.string(),
  passTypeId: z.string(),
  serial: z.string(),
});
const AppleRegistrationsQuery = z.object({
  passesUpdatedSince: z.coerce.number().int().nonnegative().optional(),
});

export async function walletRoutes(app: FastifyInstance) {
  const googleService = new GoogleWalletService();
  const appleService = new AppleWalletService();

  // ─── Google Wallet ──────────────────────────────────────────────────────

  // Génère le JWT "Add to Google Wallet" pour un client
  app.post(
    "/google/:customerId/jwt",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const params = CustomerIdParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "ValidationError" });

      const result = await googleService.createOrUpdateObject(
        request.user.business_id,
        params.data.customerId
      );
      return reply.send(result);
    }
  );

  // Force la mise à jour de l'objet fidélité Google (après un stamp/redeem)
  app.post(
    "/google/:customerId/update",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const params = CustomerIdParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "ValidationError" });

      await googleService.updateObject(request.user.business_id, params.data.customerId);
      return reply.send({ success: true });
    }
  );

  // ─── Apple Wallet ───────────────────────────────────────────────────────

  // Healthcheck de config Apple Wallet (utile en dev).
  app.get("/apple/health", async (_request, reply) => {
    return reply.send(appleService.getHealth());
  });
  // Génère et stocke le .pkpass pour un client
  app.post(
    "/apple/:customerId/create",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const params = CustomerIdParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "ValidationError" });

      const pass = await appleService.createPass(
        request.user.business_id,
        params.data.customerId
      );
      return reply.send(pass);
    }
  );

  // Télécharge le .pkpass (appelé par le bouton "Ajouter à Apple Wallet")
  app.get(
    "/apple/:customerId/download",
    async (request, reply) => {
      const params = CustomerIdParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "ValidationError" });

      const buffer = await appleService.downloadPass(params.data.customerId);
      if (!buffer) return reply.status(404).send({ error: "NotFound" });

      return reply
        .header("Content-Type", "application/vnd.apple.pkpass")
        .header("Content-Disposition", `attachment; filename="loyalty.pkpass"`)
        .send(buffer);
    }
  );

  // ─── Apple PassKit Web Service ──────────────────────────────────────────
  // Ces routes sont appelées directement par iOS (pas par le dashboard).
  // L'authentification se fait via le header "Authorization: ApplePass <authToken>"

  // Enregistrement d'un device
  app.post(
    "/apple/devices/:deviceId/registrations/:passTypeId/:serial",
    async (request, reply) => {
      const params = DeviceParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send();

      const body = request.body as { pushToken?: string };
      if (!body.pushToken) return reply.status(400).send();

      await appleService.registerDevice({
        deviceLibraryId: params.data.deviceId,
        serial: params.data.serial,
        pushToken: body.pushToken,
      });
      app.log.info(
        {
          deviceId: params.data.deviceId,
          passTypeId: params.data.passTypeId,
          serial: params.data.serial,
        },
        "Apple device registered"
      );

      return reply.status(201).send();
    }
  );

  // Désenregistrement d'un device
  app.delete(
    "/apple/devices/:deviceId/registrations/:passTypeId/:serial",
    async (request, reply) => {
      const params = DeviceParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send();

      await appleService.unregisterDevice({
        deviceLibraryId: params.data.deviceId,
        serial: params.data.serial,
      });
      app.log.info(
        {
          deviceId: params.data.deviceId,
          passTypeId: params.data.passTypeId,
          serial: params.data.serial,
        },
        "Apple device unregistered"
      );

      return reply.status(200).send();
    }
  );

  // Liste des serials mis à jour pour un device
  app.get(
    "/apple/devices/:deviceId/registrations/:passTypeId",
    async (request, reply) => {
      const { deviceId } = request.params as { deviceId: string };
      const query = AppleRegistrationsQuery.safeParse(request.query);
      if (!query.success) return reply.status(400).send({ error: "ValidationError" });

      const payload = await appleService.getUpdatedSerialsForDevice(
        deviceId,
        query.data.passesUpdatedSince
      );
      app.log.info(
        {
          deviceId,
          passTypeId: (request.params as { passTypeId: string }).passTypeId,
          passesUpdatedSince: query.data.passesUpdatedSince ?? null,
          serialCount: payload.serialNumbers.length,
          lastUpdated: payload.lastUpdated,
        },
        "Apple device requested updated serials"
      );
      return reply.send(payload);
    }
  );

  // Téléchargement du pass mis à jour (iOS tire le nouveau .pkpass)
  app.get(
    "/apple/passes/:passTypeId/:serial",
    async (request, reply) => {
      const { serial } = request.params as { serial: string };

      const buffer = await appleService.downloadPassBySerial(serial);
      if (!buffer) return reply.status(404).send();

      return reply
        .header("Content-Type", "application/vnd.apple.pkpass")
        .send(buffer);
    }
  );

  // Logs Apple (iOS envoie des erreurs ici)
  app.post("/apple/log", async (request, reply) => {
    app.log.warn({ body: request.body }, "Apple PassKit log");
    return reply.status(200).send();
  });
}

