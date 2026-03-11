/**
 * Enregistrement de tous les plugins Fastify globaux.
 * L'ordre compte : cors → multipart → rate-limit → jwt
 */

import type { FastifyInstance } from "fastify";
import { registerCors } from "./cors.js";
import { registerJwt } from "./jwt.js";
import { registerMultipart } from "./multipart.js";
import { registerRateLimit } from "./rate-limit.js";
import { registerRawBody } from "./raw-body.js";

export async function registerPlugins(app: FastifyInstance) {
  await registerCors(app);
  await registerRawBody(app);
  await registerMultipart(app);
  await registerRateLimit(app);
  await registerJwt(app);
}
