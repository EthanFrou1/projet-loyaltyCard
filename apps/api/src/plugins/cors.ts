/**
 * Plugin CORS
 * Autorise le frontend Next.js à appeler l'API.
 * En production, restreindre origin aux domaines autorisés.
 */

import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";

export async function registerCors(app: FastifyInstance) {
  await app.register(cors, {
    origin:
      process.env["NODE_ENV"] === "production"
        ? [process.env["FRONTEND_URL"] ?? "https://app.yourapp.com"]
        : true, // en dev : autoriser toutes les origines
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
}
