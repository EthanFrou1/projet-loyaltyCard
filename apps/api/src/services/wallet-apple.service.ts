/**
 * AppleWalletService
 *
 * Generation et gestion des passes Apple Wallet (.pkpass).
 */

import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { prisma } from "@loyalty/database";
import { PKPass } from "passkit-generator";
import { StorageService } from "../lib/storage.js";

interface RegisterDeviceInput {
  deviceLibraryId: string;
  serial: string;
  pushToken: string;
}

interface UnregisterDeviceInput {
  deviceLibraryId: string;
  serial: string;
}

interface AppleWalletHealth {
  ready: boolean;
  checks: {
    pass_type_identifier: boolean;
    team_identifier: boolean;
    signer_cert_exists: boolean;
    signer_key_exists: boolean;
    wwdr_exists: boolean;
    web_service_url_https: boolean;
  };
  issues: string[];
}

export class AppleWalletService {
  private passTypeId = process.env["APPLE_PASS_TYPE_IDENTIFIER"] ?? "";
  private teamId = process.env["APPLE_TEAM_IDENTIFIER"] ?? "";
  private webServiceUrl = process.env["APPLE_PASSKIT_WEB_SERVICE_URL"] ?? "";

  private signerCertPath = process.env["APPLE_SIGNER_CERT_PATH"] ?? "";
  private signerKeyPath = process.env["APPLE_SIGNER_KEY_PATH"] ?? "";
  private signerKeyPassphrase = process.env["APPLE_SIGNER_KEY_PASSPHRASE"]
    ?? process.env["APPLE_CERT_PASSWORD"]
    ?? "";
  private wwdrCertPath = process.env["APPLE_WWDR_CERT_PATH"] ?? "";

  private appUrl = process.env["APP_URL"] ?? "http://localhost:3000";
  private storage = new StorageService();

  /**
   * Genere un .pkpass pour un client et le stocke sur R2.
   */
  async createPass(businessId: string, customerId: string) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, business_id: businessId },
      include: { business: true },
    });

    if (!customer) throw new Error("Client non trouve");

    const serial = `loyalty-${customerId}`;
    const authToken = this.generateAuthToken(serial);
    const certificates = this.getCertificates();

    const pass = new PKPass({}, certificates, {
      formatVersion: 1,
      serialNumber: serial,
      description: `Carte fidelite ${customer.business.name}`,
      organizationName: customer.business.name,
      passTypeIdentifier: this.passTypeId,
      teamIdentifier: this.teamId,
      logoText: customer.business.name,
      backgroundColor: "rgb(26, 115, 232)",
      foregroundColor: "rgb(255, 255, 255)",
      labelColor: "rgb(235, 245, 255)",
      ...(this.webServiceUrl.startsWith("https://")
        ? {
            webServiceURL: this.webServiceUrl,
            authenticationToken: authToken,
          }
        : {}),
    });

    pass.type = "storeCard";

    pass.primaryFields.push({
      key: "stamps",
      label: "Tampons",
      value: customer.stamp_count,
    });

    pass.secondaryFields.push({
      key: "customer_name",
      label: "Client",
      value: customer.name,
    });

    pass.auxiliaryFields.push({
      key: "customer_id",
      label: "ID",
      value: customer.id,
    });

    pass.backFields.push({
      key: "reward",
      label: "Recompense",
      value: "Voir programme en boutique",
    });

    pass.backFields.push({
      key: "scan_url",
      label: "QR URL",
      value: `${this.appUrl}/scan/${customer.id}`,
    });

    pass.setBarcodes(`${this.appUrl}/scan/${customer.id}`);

    // Apple exige un icon. On met un PNG minimal par defaut.
    const icon = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7kL5EAAAAASUVORK5CYII=",
      "base64"
    );

    pass.addBuffer("icon.png", icon);
    pass.addBuffer("icon@2x.png", icon);
    pass.addBuffer("logo.png", icon);
    pass.addBuffer("logo@2x.png", icon);

    const buffer = pass.getAsBuffer();
    const storageKey = this.getStorageKey(businessId, customerId, serial);
    await this.storage.upload(buffer, storageKey, "application/vnd.apple.pkpass");

    const walletPass = await prisma.walletPass.upsert({
      where: { customer_id_platform: { customer_id: customerId, platform: "APPLE" } },
      create: {
        business_id: businessId,
        customer_id: customerId,
        platform: "APPLE",
        serial,
        last_version: 1,
        pass_data: {
          r2_key: storageKey,
          auth_token: authToken,
        },
      },
      update: {
        serial,
        last_version: { increment: 1 },
        pass_data: {
          r2_key: storageKey,
          auth_token: authToken,
        },
      },
    });

    return { serial, last_version: walletPass.last_version };
  }

  /**
   * Telecharge le .pkpass d'un client (par customer ID).
   */
  async downloadPass(customerId: string): Promise<Buffer | null> {
    let pass = await prisma.walletPass.findFirst({
      where: { customer_id: customerId, platform: "APPLE" },
      select: { business_id: true, customer_id: true, serial: true },
    });

    if (!pass) {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { business_id: true },
      });
      if (!customer) return null;

      await this.createPass(customer.business_id, customerId);
      pass = await prisma.walletPass.findFirst({
        where: { customer_id: customerId, platform: "APPLE" },
        select: { business_id: true, customer_id: true, serial: true },
      });
    }

    if (!pass) return null;

    const storageKey = this.getStorageKey(pass.business_id, pass.customer_id, pass.serial);
    let buffer = await this.storage.download(storageKey);

    if (!buffer) {
      await this.createPass(pass.business_id, pass.customer_id);
      buffer = await this.storage.download(storageKey);
    }

    return buffer;
  }

  /**
   * Telecharge le .pkpass par serial (utilise par le PassKit Web Service d'iOS).
   */
  async downloadPassBySerial(serial: string): Promise<Buffer | null> {
    const pass = await prisma.walletPass.findFirst({
      where: { serial, platform: "APPLE" },
      select: { business_id: true, customer_id: true, serial: true },
    });

    if (!pass) return null;

    const storageKey = this.getStorageKey(pass.business_id, pass.customer_id, pass.serial);
    let buffer = await this.storage.download(storageKey);

    if (!buffer) {
      await this.createPass(pass.business_id, pass.customer_id);
      buffer = await this.storage.download(storageKey);
    }

    return buffer;
  }

  /**
   * Enregistre un device iPhone pour les push notifications PassKit.
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
   * Desenregistre un device.
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
   * TODO : implementer avec `apn` ou `node-apn`
   */
  async pushUpdate(customerId: string) {
    const devices = await prisma.appleDevice.findMany({
      where: { customer_id: customerId },
    });

    for (const _device of devices) {
      // TODO : envoyer une notification APNs vide sur device.push_token
      // iOS appellera ensuite GET /wallet/apple/passes/:passTypeId/:serial
    }
  }

  getHealth(): AppleWalletHealth {
    const checks = {
      pass_type_identifier:
        Boolean(this.passTypeId) && !this.passTypeId.includes("yourcompany"),
      team_identifier:
        Boolean(this.teamId) && this.teamId !== "ABCDE12345",
      signer_cert_exists:
        Boolean(this.signerCertPath) && existsSync(this.signerCertPath),
      signer_key_exists:
        Boolean(this.signerKeyPath) && existsSync(this.signerKeyPath),
      wwdr_exists:
        Boolean(this.wwdrCertPath) && existsSync(this.wwdrCertPath),
      web_service_url_https:
        this.webServiceUrl.startsWith("https://"),
    };

    const issues: string[] = [];
    if (!checks.pass_type_identifier) {
      issues.push("APPLE_PASS_TYPE_IDENTIFIER absent ou placeholder.");
    }
    if (!checks.team_identifier) {
      issues.push("APPLE_TEAM_IDENTIFIER absent ou placeholder.");
    }
    if (!checks.signer_cert_exists) {
      issues.push("APPLE_SIGNER_CERT_PATH manquant ou fichier introuvable.");
    }
    if (!checks.signer_key_exists) {
      issues.push("APPLE_SIGNER_KEY_PATH manquant ou fichier introuvable.");
    }
    if (!checks.wwdr_exists) {
      issues.push("APPLE_WWDR_CERT_PATH manquant ou fichier introuvable.");
    }
    if (!checks.web_service_url_https) {
      issues.push("APPLE_PASSKIT_WEB_SERVICE_URL doit etre en HTTPS public.");
    }

    return {
      ready: issues.length === 0,
      checks,
      issues,
    };
  }

  private generateAuthToken(serial: string): string {
    return createHmac("sha256", process.env["JWT_SECRET"] ?? "dev")
      .update(serial)
      .digest("hex")
      .slice(0, 32);
  }

  private getStorageKey(businessId: string, customerId: string, serial: string): string {
    return `wallet/apple/${businessId}/${customerId}/${serial}.pkpass`;
  }

  private getCertificates() {
    if (!this.passTypeId || !this.teamId) {
      throw new Error("APPLE_PASS_TYPE_IDENTIFIER et APPLE_TEAM_IDENTIFIER sont requis.");
    }

    if (!this.signerCertPath || !this.signerKeyPath || !this.wwdrCertPath) {
      throw new Error(
        "Certificats Apple incomplets. Definir APPLE_SIGNER_CERT_PATH, APPLE_SIGNER_KEY_PATH et APPLE_WWDR_CERT_PATH."
      );
    }

    if (this.signerCertPath.endsWith(".p12") || this.signerKeyPath.endsWith(".p12")) {
      throw new Error(
        "APPLE_SIGNER_CERT_PATH/APPLE_SIGNER_KEY_PATH doivent etre des PEM. Convertis le .p12 en cert+key PEM."
      );
    }

    if (
      !existsSync(this.signerCertPath)
      || !existsSync(this.signerKeyPath)
      || !existsSync(this.wwdrCertPath)
    ) {
      throw new Error("Un ou plusieurs fichiers certificats Apple sont introuvables.");
    }

    return {
      wwdr: readFileSync(this.wwdrCertPath),
      signerCert: readFileSync(this.signerCertPath),
      signerKey: readFileSync(this.signerKeyPath),
      signerKeyPassphrase: this.signerKeyPassphrase || undefined,
    };
  }
}
