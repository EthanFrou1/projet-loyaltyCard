/**
 * Point d'entrée du serveur Fastify.
 *
 * Ordre de démarrage :
 *   1. Créer l'instance Fastify
 *   2. Enregistrer les plugins globaux (cors, jwt, rate-limit…)
 *   3. Enregistrer les routes
 *   4. Démarrer le serveur
 */

import Fastify from "fastify";
import { registerPlugins } from "./plugins/index.js";
import { registerRoutes } from "./routes/index.js";

const HOST = process.env["API_HOST"] ?? "0.0.0.0";
const PORT = Number(process.env["API_PORT"] ?? 3001);

async function bootstrap() {
  const app = Fastify({
    logger: {
      level: process.env["NODE_ENV"] === "production" ? "warn" : "debug",
      transport:
        process.env["NODE_ENV"] !== "production"
          ? { target: "pino-pretty" }
          : undefined,
    },
  });

  // 1. Plugins globaux (auth, cors, rate-limit, multipart…)
  await registerPlugins(app);

  // 2. Routes REST
  await registerRoutes(app);

  // 3. Démarrage
  try {
    await app.listen({ host: HOST, port: PORT });
    app.log.info(`API démarrée sur http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();
