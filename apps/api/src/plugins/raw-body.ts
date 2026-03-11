import type { FastifyInstance } from "fastify";
import fastifyRawBody from "fastify-raw-body";

export async function registerRawBody(app: FastifyInstance) {
  await app.register(fastifyRawBody, {
    field: "rawBody",
    global: false,
    encoding: "utf8",
    runFirst: true,
  });
}
