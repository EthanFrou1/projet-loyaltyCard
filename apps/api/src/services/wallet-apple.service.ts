/**
 * AppleWalletService
 *
 * Génération et gestion des passes Apple Wallet (.pkpass).
 *
 * Un .pkpass est une archive ZIP contenant :
 *   - pass.json        : données du pass (type, champs, couleurs…)
 *   - icon.png         : icône 29×29
 *   - icon@2x.png      : icône 58×58
 *   - logo.png         : logo affiché sur le pass
 *   - manifest.json    : SHA1 de chaque fichier
 *   - signature        : signature PKCS#7 du manifest
 *
 * Prérequis (à configurer avant d'utiliser) :
 *   - Certificat Pass Type ID dans Apple Developer Console
 *   - Certificat WWDR (Apple Worldwide Developer Relations)
 *   - Variables d'env : APPLE_PASS_TYPE_IDENTIFIER, APPLE_TEAM_IDENTIFIER,
 *     APPLE_CERT_PATH, APPLE_CERT_PASSWORD, APPLE_WWDR_CERT_PATH
 *
 * TODO : installer `passkit-generator` → npm i passkit-generator
 * Doc : https://developer.apple.com/documentation/walletpasses
 */

import { createHmac } from "node:crypto";
import { prisma } from "@loyalty/database";

interface RegisterDeviceInput {
  deviceLibraryId: string;
  serial: string;
  pushToken: string;
}

interface UnregisterDeviceInput {
  deviceLibraryId: string;
  serial: string;
}

export class AppleWalletService {
  private passTypeId = process.env["APPLE_PASS_TYPE_IDENTIFIER"] ?? "";
  private teamId = process.env["APPLE_TEAM_IDENTIFIER"] ?? "";
  private webServiceUrl = process.env["APPLE_PASSKIT_WEB_SERVICE_URL"] ?? "";

  /**
   * Génère un .pkpass pour un client et le stocke sur R2.
   * Retourne les métadonnées du pass créé.
   */
  async createPass(businessId: string, customerId: string) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, business_id: businessId },
      include: { business: true },
    });

    if (!customer) throw new Error("Client non trouvé");

    const serial = `loyalty-${customerId}`;
    const authToken = this.generateAuthToken(serial);

    // ── Données du pass ──────────────────────────────────────────────────────
    // TODO : utiliser passkit-generator pour créer le .pkpass signé
    // const pass = new PKPass({ ... })
    //
    // pass.type = "storeCard"
    // pass.teamIdentifier = this.teamId
    // pass.passTypeIdentifier = this.passTypeId
    // pass.serialNumber = serial
    // pass.webServiceURL = this.webServiceUrl
    // pass.authenticationToken = authToken
    //
    // pass.primaryFields.push({
    //   key: "stamps",
    //   label: "Tampons",
    //   value: customer.stamp_count,
    // })
    //
    // const buffer = await pass.getAsBuffer()
    // → uploader sur R2, sauvegarder en base

    // Upsert du WalletPass en base
    const walletPass = await prisma.walletPass.upsert({
      where: { customer_id_platform: { customer_id: customerId, platform: "APPLE" } },
      create: {
        business_id: businessId,
        customer_id: customerId,
        platform: "APPLE",
        serial,
        last_version: 1,
      },
      update: {
        last_version: { increment: 1 },
      },
    });

    return { serial, last_version: walletPass.last_version };
  }

  /**
   * Télécharge le .pkpass d'un client (par customer ID).
   * Retourne un Buffer ou null si non trouvé.
   */
  async downloadPass(customerId: string): Promise<Buffer | null> {
    // TODO : récupérer le .pkpass depuis R2 et le retourner
    return null;
  }

  /**
   * Télécharge le .pkpass par serial (utilisé par le PassKit Web Service d'iOS).
   */
  async downloadPassBySerial(serial: string): Promise<Buffer | null> {
    // TODO : récupérer depuis R2 par serial
    return null;
  }

  /**
   * Enregistre un device iPhone pour les push notifications PassKit.
   * Appelé par iOS quand le client ajoute le pass.
   */
  async registerDevice(input: RegisterDeviceInput) {
    const pass = await prisma.walletPass.findFirst({
      where: { serial: input.serial, platform: "APPLE" },
    });

    if (!pass) return;

    await prisma.appleDevice.upsert({
      where: {
        customer_id_device_library_id: {
          customer_id: pass.customer_id,
          device_library_id: input.deviceLibraryId,
        },
      },
      create: {
        customer_id: pass.customer_id,
        device_library_id: input.deviceLibraryId,
        push_token: input.pushToken,
      },
      update: {
        push_token: input.pushToken,
      },
    });
  }

  /**
   * Désenregistre un device (le client a supprimé le pass de son iPhone).
   */
  async unregisterDevice(input: UnregisterDeviceInput) {
    const pass = await prisma.walletPass.findFirst({
      where: { serial: input.serial, platform: "APPLE" },
    });

    if (!pass) return;

    await prisma.appleDevice.deleteMany({
      where: {
        customer_id: pass.customer_id,
        device_library_id: input.deviceLibraryId,
      },
    });
  }

  /**
   * Envoie une notification APNs pour forcer le refresh du pass sur iOS.
   * Appelé après chaque stamp/redeem.
   * TODO : implémenter avec `apn` ou `node-apn`
   */
  async pushUpdate(customerId: string) {
    const devices = await prisma.appleDevice.findMany({
      where: { customer_id: customerId },
    });

    for (const device of devices) {
      // TODO : envoyer une notification APNs vide sur device.push_token
      // iOS appellera ensuite GET /wallet/apple/passes/:passTypeId/:serial
    }
  }

  // ─── Helpers privés ─────────────────────────────────────────────────────────

  /**
   * Génère un token d'authentification aléatoire pour le PassKit Web Service.
   * Ce token est envoyé par iOS dans le header Authorization pour s'identifier.
   */
  private generateAuthToken(serial: string): string {
    return createHmac("sha256", process.env["JWT_SECRET"] ?? "dev")
      .update(serial)
      .digest("hex")
      .slice(0, 32);
  }
}
