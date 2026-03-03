/**
 * Plugin Multipart
 * Permet l'upload de fichiers (logo) via multipart/form-data.
 * Limite : 10 MB par fichier.
 */

import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";

export async function registerMultipart(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB
      files: 1,
    },
  });
}
