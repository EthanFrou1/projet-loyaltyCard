/**
 * StampService
 * Logique métier des tampons et des récompenses.
 *
 * Règles métier :
 *   - addStamp : +1 tampon → transaction STAMP_ADD, update stamp_count
 *     → si stamp_count atteint le seuil → reward_unlocked: true
 *   - redeemReward : vérifie que stamp_count >= seuil → remet à 0
 *     → transaction STAMP_REDEEM avec delta = -seuil
 *
 * Tout se fait dans une transaction Prisma pour garantir la cohérence.
 */

import { prisma } from "@loyalty/database";

interface StampProgramConfig {
  threshold: number;
  reward_label: string;
}

export class StampService {
  /**
   * Ajoute 1 tampon au client et retourne l'état mis à jour.
   */
  async addStamp(
    businessId: string,
    customerId: string,
    programId: string,
    note?: string
  ) {
    // Vérifier que le client et le programme existent et appartiennent au business
    const [customer, program] = await Promise.all([
      prisma.customer.findFirst({ where: { id: customerId, business_id: businessId } }),
      // Accepte les programmes ACTIVE et ARCHIVED : un client inscrit dans un
      // programme archivé doit toujours pouvoir recevoir des tampons.
      prisma.program.findFirst({ where: { id: programId, business_id: businessId } }),
    ]);

    if (!customer || !program) return null;

    const config = program.config_json as unknown as StampProgramConfig;
    const threshold = config.threshold ?? 10;

    // Transaction atomique : créer la transaction + incrémenter le compteur
    const [transaction, updatedCustomer] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          business_id: businessId,
          customer_id: customerId,
          program_id: programId,
          type: "STAMP_ADD",
          delta: 1,
          note: note ?? null,
        },
      }),
      prisma.customer.update({
        where: { id: customerId },
        data: { stamp_count: { increment: 1 } },
      }),
    ]);

    const rewardUnlocked = updatedCustomer.stamp_count >= threshold;

    return {
      customer: {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        stamp_count: updatedCustomer.stamp_count,
        point_count: updatedCustomer.point_count,
      },
      transaction: {
        id: transaction.id,
        type: transaction.type,
        delta: transaction.delta,
        note: transaction.note,
        created_at: transaction.created_at.toISOString(),
      },
      reward_unlocked: rewardUnlocked,
    };
  }

  /**
   * Consomme la récompense et remet le compteur à 0.
   * Retourne null si le client n'a pas assez de tampons.
   */
  async redeemReward(
    businessId: string,
    customerId: string,
    programId: string,
    note?: string
  ) {
    const [customer, program] = await Promise.all([
      prisma.customer.findFirst({ where: { id: customerId, business_id: businessId } }),
      // Accepte les programmes ACTIVE et ARCHIVED : un client inscrit dans un
      // programme archivé doit toujours pouvoir recevoir des tampons.
      prisma.program.findFirst({ where: { id: programId, business_id: businessId } }),
    ]);

    if (!customer || !program) return null;

    const config = program.config_json as unknown as StampProgramConfig;
    const threshold = config.threshold ?? 10;

    // Vérifier que la récompense est bien disponible
    if (customer.stamp_count < threshold) return null;

    const [transaction, updatedCustomer] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          business_id: businessId,
          customer_id: customerId,
          program_id: programId,
          type: "STAMP_REDEEM",
          delta: -threshold,
          note: note ?? `Récompense : ${config.reward_label}`,
        },
      }),
      prisma.customer.update({
        where: { id: customerId },
        // Remet à 0 (ou soustrait le seuil si on veut conserver le surplus)
        data: { stamp_count: 0 },
      }),
    ]);

    return {
      customer: {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        stamp_count: updatedCustomer.stamp_count,
        point_count: updatedCustomer.point_count,
      },
      transaction: {
        id: transaction.id,
        type: transaction.type,
        delta: transaction.delta,
        note: transaction.note,
        created_at: transaction.created_at.toISOString(),
      },
    };
  }
}
