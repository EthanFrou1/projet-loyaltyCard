/**
 * GoogleWalletService
 *
 * Intégration Google Wallet API (Loyalty passes).
 *
 * Flux :
 *   1. Créer une LoyaltyClass par business (une seule fois)
 *   2. Créer/mettre à jour un LoyaltyObject par client
 *   3. Générer un JWT "Save to Google Wallet" pour que le client ajoute le pass
 *
 * Authentification : Service Account Google (GOOGLE_SERVICE_ACCOUNT_*)
 * Doc : https://developers.google.com/wallet/retail/loyalty-cards
 *
 * TODO : installer `googleapis` → npm i googleapis
 */

import { prisma } from "@loyalty/database";

// Placeholder du payload JWT Google Wallet
interface GoogleWalletJwtPayload {
  jwt: string;
  save_url: string;
}

export class GoogleWalletService {
  private issuerId = process.env["GOOGLE_WALLET_ISSUER_ID"] ?? "";

  /**
   * Crée ou met à jour un LoyaltyObject Google pour un client,
   * puis génère le JWT "Add to Google Wallet".
   */
  async createOrUpdateObject(
    businessId: string,
    customerId: string
  ): Promise<GoogleWalletJwtPayload> {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, business_id: businessId },
      include: { business: true },
    });

    if (!customer) throw new Error("Client non trouvé");

    // TODO : appeler l'API Google Wallet pour créer/mettre à jour l'objet
    // const auth = new google.auth.GoogleAuth({ ... })
    // const walletClient = google.walletobjects({ version: 'v1', auth })

    // Stocker / mettre à jour le WalletPass en base
    await prisma.walletPass.upsert({
      where: { customer_id_platform: { customer_id: customerId, platform: "GOOGLE" } },
      create: {
        business_id: businessId,
        customer_id: customerId,
        platform: "GOOGLE",
        serial: `${this.issuerId}.${customerId}`,
        last_version: 1,
      },
      update: {
        last_version: { increment: 1 },
      },
    });

    // Placeholder — à remplacer par la vraie génération JWT Google
    const objectId = `${this.issuerId}.${customerId}`;
    const jwt = `TODO_GOOGLE_JWT_FOR_${objectId}`;
    const saveUrl = `https://pay.google.com/gp/v/save/${jwt}`;

    return { jwt, save_url: saveUrl };
  }

  /**
   * Met à jour les données de l'objet fidélité (après stamp/redeem).
   * Appelé automatiquement après chaque transaction.
   */
  async updateObject(businessId: string, customerId: string): Promise<void> {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, business_id: businessId },
    });

    if (!customer) return;

    // TODO : PATCH sur l'objet Google Wallet via l'API
    // Mettre à jour loyaltyPoints.balance.int

    // Incrémenter la version locale
    await prisma.walletPass.updateMany({
      where: { customer_id: customerId, platform: "GOOGLE" },
      data: { last_version: { increment: 1 } },
    });
  }
}
