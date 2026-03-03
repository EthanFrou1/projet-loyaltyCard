/**
 * @loyalty/database
 *
 * Point d'entrée du package database.
 * Exporte le client Prisma singleton + tous les types générés.
 *
 * Utilisation dans les autres packages :
 *   import { prisma } from '@loyalty/database'
 *   import type { Customer, Transaction } from '@loyalty/database'
 */

import { PrismaClient } from "@prisma/client";

// ─── Singleton Prisma (évite de créer N connexions en dev avec HMR) ───────────
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env["NODE_ENV"] === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}

// ─── Re-export de tous les types Prisma ───────────────────────────────────────
export type {
  User,
  Business,
  Program,
  Customer,
  Transaction,
  WalletPass,
  AppleDevice,
  AiJob,
  AiAsset,
  UsageCounter,
} from "@prisma/client";

export {
  ProgramType,
  UserRole,
  WalletPlatform,
  AiJobStatus,
  AiJobType,
  TransactionType,
} from "@prisma/client";
