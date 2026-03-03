/**
 * Configuration BullMQ
 *
 * On utilise une seule queue "ai-jobs" pour tous les types de jobs IA.
 * Le worker (src/workers/ai.worker.ts) écoute cette queue.
 *
 * En dev : Redis local (localhost:6379)
 * En prod : Upstash Redis (REDIS_URL)
 */

import { Queue } from "bullmq";
import IORedis from "ioredis";

// Connexion Redis partagée (singleton)
let redisConnection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!redisConnection) {
    redisConnection = new IORedis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null, // requis pour BullMQ
    });
  }
  return redisConnection;
}

// Queue singleton pour les jobs IA
let aiQueue: Queue | null = null;

export function getAiQueue(): Queue {
  if (!aiQueue) {
    aiQueue = new Queue("ai-jobs", {
      connection: getRedisConnection(),
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
