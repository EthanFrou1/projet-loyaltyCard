/**
 * Configuration BullMQ
 *
 * On utilise une seule queue "ai-jobs" pour tous les types de jobs IA.
 * Le worker (src/workers/ai.worker.ts) écoute cette queue.
 *
 * En dev : Redis local (localhost:6379)
 * En prod : Upstash Redis (REDIS_URL)
 */

import { Queue, type ConnectionOptions } from "bullmq";

/** Parse une URL Redis en options BullMQ (évite le conflit de types ioredis/bullmq). */
function parseRedisUrl(url: string): ConnectionOptions {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "localhost",
      port: parseInt(parsed.port || "6379", 10),
      password: parsed.password || undefined,
      db: parseInt(parsed.pathname.slice(1) || "0", 10),
      maxRetriesPerRequest: null, // requis pour BullMQ
    };
  } catch {
    return { host: "localhost", port: 6379, maxRetriesPerRequest: null };
  }
}

// Options de connexion partagées (BullMQ gère ses propres instances ioredis en interne)
const redisOptions = parseRedisUrl(process.env["REDIS_URL"] ?? "redis://localhost:6379");

export function getRedisConnection(): ConnectionOptions {
  return redisOptions;
}

// Queue singleton pour les jobs IA
let aiQueue: Queue | null = null;

export function getAiQueue(): Queue {
  if (!aiQueue) {
    aiQueue = new Queue("ai-jobs", {
      connection: redisOptions,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return aiQueue;
}
