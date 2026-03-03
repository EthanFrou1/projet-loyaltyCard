/**
 * Plugin Rate Limit
 * Protège l'API contre les abus.
 * Les endpoints IA ont une limite plus stricte (coût par appel).
 */

import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

export async function registerRateLimit(app: FastifyInstance) {
  await app.register(rateLimit, {
    global: true,
    max: 100,          // 100 requêtes par fenêtre
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      error: "TooManyRequests",
      message: "Trop de requêtes, réessayez dans une minute.",
      statusCode: 429,
    }),
  });
}
