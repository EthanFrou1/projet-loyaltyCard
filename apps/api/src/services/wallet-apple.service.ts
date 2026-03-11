/**
 * AppleWalletService
 *
 * Génération et gestion des passes Apple Wallet (.pkpass).
 */

import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { prisma } from "@loyalty/database";
import { PKPass } from "passkit-generator";
import sharp from "sharp";
import apn from "apn";
import { StorageService } from "../lib/storage.js";

// PNG 1×1 transparent — utilisé comme fallback si pas de logo établissement
const FALLBACK_ICON = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7kL5EAAAAASUVORK5CYII=",
  "base64"
);

/** Applique un masque circulaire à une image et retourne un PNG carré. */
async function applyCircularMask(buffer: Buffer, size = 160): Promise<Buffer> {
  const circle = Buffer.from(
    `<svg><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`
  );
  return sharp(buffer)
    .resize(size, size, { fit: "cover", position: "centre" })
    .composite([{ input: circle, blend: "dest-in" }])
    .png()
    .toBuffer();
}

/** Télécharge une image depuis une URL et retourne un Buffer, ou null en cas d'erreur. */
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

type ProgramConfig = {
  threshold?: number;
  reward_label?: string;
  background_color?: string;
  text_color?: "light" | "dark";
};

async function drawStampGridOnStrip(
  stripBuffer: Buffer,
  filled: number,
  total: number
): Promise<Buffer> {
  const meta = await sharp(stripBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) return stripBuffer;

  const count = Math.max(1, total);
  const firstRowCount = Math.ceil(count / 2);
  const secondRowCount = count - firstRowCount;
  const circle = Math.max(26, Math.round(Math.min(width / 10.5, height / 2.9)));
  const stroke = Math.max(2, Math.round(circle * 0.08));

  const row1Y = Math.round(height * 0.35);
  const row2Y = secondRowCount > 0 ? Math.round(height * 0.65) : row1Y;

  const rowMargin = Math.round(width * 0.08);
  const span = Math.max(width - rowMargin * 2, 1);

  const rowXs = (rowCount: number) => {
    if (rowCount <= 1) return [Math.round(width / 2)];
    const step = span / (rowCount - 1);
    return Array.from({ length: rowCount }, (_, i) => Math.round(rowMargin + i * step));
  };

  const x1 = rowXs(firstRowCount);
  const x2 = rowXs(secondRowCount);

  type Dot = { x: number; y: number; index: number };
  const dots: Dot[] = [
    ...x1.map((x, i) => ({ x, y: row1Y, index: i })),
    ...x2.map((x, i) => ({ x, y: row2Y, index: firstRowCount + i })),
  ];

  const nodes = dots.map(({ x, y, index }) => {
    const isFilled = index < filled;
    if (!isFilled) {
      return `<circle cx="${x}" cy="${y}" r="${circle / 2}" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.92)" stroke-width="${stroke}" />`;
    }
    const checkW = circle * 0.32;
    const p1x = x - checkW * 0.6;
    const p1y = y + checkW * 0.05;
    const p2x = x - checkW * 0.15;
    const p2y = y + checkW * 0.5;
    const p3x = x + checkW * 0.7;
    const p3y = y - checkW * 0.5;
    return [
      `<circle cx="${x}" cy="${y}" r="${circle / 2}" fill="rgba(255,255,255,0.95)" stroke="rgba(255,255,255,0.95)" stroke-width="${stroke}" />`,
      `<path d="M ${p1x} ${p1y} L ${p2x} ${p2y} L ${p3x} ${p3y}" fill="none" stroke="rgba(20,20,20,0.92)" stroke-width="${Math.max(2, Math.round(circle * 0.11))}" stroke-linecap="round" stroke-linejoin="round" />`,
    ].join("");
  });

  const overlay = Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${nodes.join("")}</svg>`
  );

  return sharp(stripBuffer).composite([{ input: overlay }]).png().toBuffer();
}

// Paths SVG Lucide (viewBox 0 0 24 24) par type d'établissement
const STRIP_ICON_PATHS: Record<string, string> = {
  salon_coiffure: `<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" x2="8.12" y1="4" y2="15.88"/><line x1="14.47" x2="20" y1="14.48" y2="20"/><line x1="8.12" x2="12" y1="8.12" y2="12"/>`,
  barbier: `<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" x2="8.12" y1="4" y2="15.88"/><line x1="14.47" x2="20" y1="14.48" y2="20"/><line x1="8.12" x2="12" y1="8.12" y2="12"/>`,
  institut_beaute: `<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>`,
  spa: `<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>`,
  onglerie: `<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>`,
  restaurant: `<path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.9.9 2.5.9 3.4 0l1-1c.9-.9.9-2.5 0-3.4z"/>`,
  cafe: `<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/>`,
  boutique: `<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>`,
  autre: `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`,
};

/**
 * Génère un Buffer PNG d'image strip basé sur le type d'établissement.
 * Utilisé comme fallback quand aucune cover_photo_url n'est définie.
 */
async function buildTypeStripBuffer(establishmentType: string | null, bgHex: string): Promise<Buffer> {
  const type = establishmentType ?? "autre";
  const paths = STRIP_ICON_PATHS[type] ?? STRIP_ICON_PATHS["autre"]!;
  const w = 750;
  const h = 288;
  // Couleur légèrement plus claire pour le dégradé
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${bgHex}"/>
    <rect width="${w}" height="${h}" fill="rgba(255,255,255,0.06)"/>
    <svg x="${(w - 120) / 2}" y="${(h - 120) / 2}" width="120" height="120" viewBox="0 0 24 24"
      fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.2"
      stroke-linecap="round" stroke-linejoin="round">
      ${paths}
    </svg>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function hexToAppleRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "rgb(26, 115, 232)";
  return `rgb(${parseInt(result[1]!, 16)}, ${parseInt(result[2]!, 16)}, ${parseInt(result[3]!, 16)})`;
}

interface RegisterDeviceInput {
  deviceLibraryId: string;
  serial: string;
  pushToken: string;
}

interface UnregisterDeviceInput {
  deviceLibraryId: string;
  serial: string;
}

interface UpdatedSerialsResult {
  serialNumbers: string[];
  lastUpdated: string;
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
    web_service_url_real: boolean;
    web_service_url_path: boolean;
  };
  issues: string[];
}

export class AppleWalletService {
  private passTypeId = process.env["APPLE_PASS_TYPE_IDENTIFIER"] ?? "";
  private teamId = process.env["APPLE_TEAM_IDENTIFIER"] ?? "";
  private webServiceUrl = this.normalizeAppleWebServiceUrl(
    process.env["APPLE_PASSKIT_WEB_SERVICE_URL"] ?? ""
  );

  private signerCertPath = process.env["APPLE_SIGNER_CERT_PATH"] ?? "";
  private signerKeyPath = process.env["APPLE_SIGNER_KEY_PATH"] ?? "";
  private signerKeyPassphrase = process.env["APPLE_SIGNER_KEY_PASSPHRASE"]
    ?? process.env["APPLE_CERT_PASSWORD"]
    ?? "";
  private wwdrCertPath = process.env["APPLE_WWDR_CERT_PATH"] ?? "";

  private appUrl = process.env["APP_URL"] ?? "http://localhost:3000";
  private storage = new StorageService();
  private apnsProvider: apn.Provider | null = null;
  private apnsUseProduction = process.env["APPLE_APNS_PRODUCTION"] === "true";

  /**
   * Génère un .pkpass pour un client et le stocke sur R2.
   */
  async createPass(businessId: string, customerId: string) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, business_id: businessId },
      include: {
        business: { select: { id: true, name: true, logo_url: true, cover_photo_url: true, settings_json: true } },
        program: true,
      },
    });

    if (!customer) throw new Error("Client non trouvé");

    // Paramètres du programme fidélité
    const cfg = (customer.program?.config_json ?? {}) as ProgramConfig;
    const threshold = cfg.threshold ?? 10;
    const rewardLabel = cfg.reward_label ?? "Récompense";
    const programName = customer.program?.name ?? "Carte fidélité";
    const bgColor = cfg.background_color
      ? hexToAppleRgb(cfg.background_color)
      : "rgb(26, 26, 46)";
    const isDark = cfg.text_color === "dark";
    const fgColor = isDark ? "rgb(20, 20, 20)" : "rgb(255, 255, 255)";
    const labelColor = isDark ? "rgb(100, 100, 100)" : "rgb(210, 230, 255)";

    const serial = `loyalty-${customerId}`;
    const authToken = this.generateAuthToken(serial);
    const certificates = this.getCertificates();

    const pass = new PKPass({}, certificates, {
      formatVersion: 1,
      serialNumber: serial,
      description: programName,
      organizationName: customer.business.name,
      passTypeIdentifier: this.passTypeId,
      teamIdentifier: this.teamId,
      logoText: customer.business.name,
      backgroundColor: bgColor,
      foregroundColor: fgColor,
      labelColor: labelColor,
      ...(this.webServiceUrl.startsWith("https://")
        ? {
            webServiceURL: this.webServiceUrl,
            authenticationToken: authToken,
          }
        : {}),
    });

    pass.type = "storeCard";

    const stampCount = customer.stamp_count;
    const filledCount = Math.min(stampCount, threshold);

    // Header (haut droite) : progression X/Y
    pass.headerFields.push({
      key: "stamps_progress",
      label: "",
      value: `${filledCount}/${threshold}`,
      textAlignment: "PKTextAlignmentRight",
    });

    // Secondary : programme (gauche) + récompense (droite)
    pass.secondaryFields.push({
      key: "program",
      label: "PROGRAMME",
      value: programName,
    });

    pass.secondaryFields.push({
      key: "reward",
      label: "RÉCOMPENSE",
      value: rewardLabel,
    });

    // Dos de la carte : détails complets
    pass.backFields.push({
      key: "reward_back",
      label: "Récompense",
      value: rewardLabel,
    });

    pass.backFields.push({
      key: "program_back",
      label: "Programme",
      value: programName,
    });

    pass.backFields.push({
      key: "scan_url",
      label: "QR URL",
      value: `${this.appUrl}/scan/${customer.id}`,
    });

    pass.setBarcodes(`${this.appUrl}/scan/${customer.id}`);

    // Logo : icône circulaire dans le header
    const rawLogoBuffer = customer.business.logo_url
      ? (await fetchImageBuffer(customer.business.logo_url) ?? FALLBACK_ICON)
      : FALLBACK_ICON;

    const logoBuffer = rawLogoBuffer === FALLBACK_ICON
      ? rawLogoBuffer
      : await applyCircularMask(rawLogoBuffer).catch(() => rawLogoBuffer);

    pass.addBuffer("icon.png", logoBuffer);
    pass.addBuffer("icon@2x.png", logoBuffer);
    pass.addBuffer("logo.png", logoBuffer);
    pass.addBuffer("logo@2x.png", logoBuffer);

    // Strip : photo de l'établissement ou SVG par type d'établissement
    let stripBuffer: Buffer | null = null;
    if (customer.business.cover_photo_url) {
      stripBuffer = await fetchImageBuffer(customer.business.cover_photo_url);
    }
    if (!stripBuffer) {
      const estType = (customer.business.settings_json as { establishment_type?: string } | null)?.establishment_type ?? null;
      const hexBg = cfg.background_color ?? "#1a1a2e";
      stripBuffer = await buildTypeStripBuffer(estType, hexBg).catch(() => null);
    }
    if (stripBuffer) {
      const stripWithStamps = await drawStampGridOnStrip(stripBuffer, filledCount, threshold)
        .catch(() => stripBuffer!);
      pass.addBuffer("strip.png", stripWithStamps);
      pass.addBuffer("strip@2x.png", stripWithStamps);
    }

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
   * Régénère le pass seulement s'il existe déjà côté Apple Wallet.
   * Évite de créer un pass inutile pour les clients qui ne l'ont pas ajouté.
   */
  async refreshPassIfExists(businessId: string, customerId: string): Promise<void> {
    const existing = await prisma.walletPass.findFirst({
      where: { business_id: businessId, customer_id: customerId, platform: "APPLE" },
      select: { id: true },
    });
    if (!existing) return;
    await this.createPass(businessId, customerId);
    await this.pushUpdate(customerId);
  }

  /**
   * Télécharge le .pkpass d'un client (par customer ID).
   */
  async downloadPass(customerId: string): Promise<Buffer | null> {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { business_id: true },
    });
    if (!customer) return null;

    // Toujours regénérer pour avoir le design et les données à jour
    await this.createPass(customer.business_id, customerId);

    const pass = await prisma.walletPass.findFirst({
      where: { customer_id: customerId, platform: "APPLE" },
      select: { business_id: true, customer_id: true, serial: true },
    });
    if (!pass) return null;

    const storageKey = this.getStorageKey(pass.business_id, pass.customer_id, pass.serial);
    return this.storage.download(storageKey);
  }

  /**
   * Télécharge le .pkpass par serial (utilisé par le PassKit Web Service d'iOS).
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
   * Enregistre un appareil iPhone pour les push notifications PassKit.
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
   * Désenregistre un appareil.
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
   * Retourne les serials Apple mis à jour pour un device (web service PassKit).
   */
  async getUpdatedSerialsForDevice(
    deviceLibraryId: string,
    passesUpdatedSince?: number
  ): Promise<UpdatedSerialsResult> {
    const deviceLinks = await prisma.appleDevice.findMany({
      where: { device_library_id: deviceLibraryId },
      select: { customer_id: true },
    });

    const customerIds = [...new Set(deviceLinks.map((d) => d.customer_id))];
    if (customerIds.length === 0) {
      return { serialNumbers: [], lastUpdated: String(passesUpdatedSince ?? 0) };
    }

    const passes = await prisma.walletPass.findMany({
      where: {
        platform: "APPLE",
        customer_id: { in: customerIds },
        ...(typeof passesUpdatedSince === "number"
          ? { last_version: { gt: passesUpdatedSince } }
          : {}),
      },
      select: { serial: true, last_version: true },
      orderBy: { last_version: "asc" },
    });

    const maxVersion = passes.reduce(
      (max, p) => (p.last_version > max ? p.last_version : max),
      passesUpdatedSince ?? 0
    );

    return {
      serialNumbers: passes.map((p) => p.serial),
      lastUpdated: String(maxVersion),
    };
  }

  /** Envoie une notification APNs pour forcer le refresh du pass sur iOS. */
  async pushUpdate(customerId: string) {
    const devices = await prisma.appleDevice.findMany({
      where: { customer_id: customerId },
    });

    if (devices.length === 0) return;
    const provider = this.getApnsProvider();
    if (!provider) return;

    const tokenList = devices.map((d) => d.push_token).filter(Boolean);
    if (tokenList.length === 0) return;

    const note = new apn.Notification();
    note.topic = this.passTypeId;
    note.contentAvailable = true;
    note.priority = 5;
    note.expiry = Math.floor(Date.now() / 1000) + 60;

    const result = await provider.send(note, tokenList);
    if (result.failed.length > 0) {
      for (const failed of result.failed) {
        const token = typeof failed.device === "string"
          ? failed.device
          : (failed.device as { token?: string }).token;
        const reason = failed.response?.reason ?? "";
        if (token && ["Unregistered", "BadDeviceToken", "DeviceTokenNotForTopic"].includes(reason)) {
          await prisma.appleDevice.deleteMany({
            where: { customer_id: customerId, push_token: token },
          });
        }
      }
    }
  }

  getHealth(): AppleWalletHealth {
    const webServiceUrlLooksReal = Boolean(this.webServiceUrl)
      && !this.webServiceUrl.includes("yourapp.com")
      && !this.webServiceUrl.includes("localhost");
    const webServiceUrlHasExpectedPath = this.webServiceUrl.endsWith("/api/v1/wallet/apple");

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
      web_service_url_real:
        webServiceUrlLooksReal,
      web_service_url_path:
        webServiceUrlHasExpectedPath,
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
      issues.push("APPLE_PASSKIT_WEB_SERVICE_URL doit être en HTTPS public.");
    }
    if (!checks.web_service_url_real) {
      issues.push("APPLE_PASSKIT_WEB_SERVICE_URL semble être un placeholder/localhost.");
    }
    if (!checks.web_service_url_path) {
      issues.push("APPLE_PASSKIT_WEB_SERVICE_URL doit finir par /api/v1/wallet/apple.");
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

  private getApnsProvider(): apn.Provider | null {
    if (this.apnsProvider) return this.apnsProvider;
    if (!this.passTypeId) return null;
    if (!this.signerCertPath || !existsSync(this.signerCertPath)) return null;
    if (!this.signerKeyPath || !existsSync(this.signerKeyPath)) return null;

    this.apnsProvider = new apn.Provider({
      cert: this.signerCertPath,
      key: this.signerKeyPath,
      passphrase: this.signerKeyPassphrase || undefined,
      production: this.apnsUseProduction,
    });
    return this.apnsProvider;
  }

  private getStorageKey(businessId: string, customerId: string, serial: string): string {
    return `wallet/apple/${businessId}/${customerId}/${serial}.pkpass`;
  }

  private normalizeAppleWebServiceUrl(raw: string): string {
    const value = raw.trim().replace(/\/+$/, "");
    if (!value) return "";
    if (value.endsWith("/api/v1/wallet/apple")) return value;
    if (value.endsWith("/wallet/apple")) return `${value.slice(0, -"/wallet/apple".length)}/api/v1/wallet/apple`;
    try {
      const url = new URL(value);
      if (!url.pathname || url.pathname === "/") return `${value}/api/v1/wallet/apple`;
    } catch {
      return value;
    }
    return value;
  }

  private getCertificates() {
    if (!this.passTypeId || !this.teamId) {
      throw new Error("APPLE_PASS_TYPE_IDENTIFIER et APPLE_TEAM_IDENTIFIER sont requis.");
    }

    if (!this.signerCertPath || !this.signerKeyPath || !this.wwdrCertPath) {
      throw new Error(
        "Certificats Apple incomplets. Définir APPLE_SIGNER_CERT_PATH, APPLE_SIGNER_KEY_PATH et APPLE_WWDR_CERT_PATH."
      );
    }

    if (this.signerCertPath.endsWith(".p12") || this.signerKeyPath.endsWith(".p12")) {
      throw new Error(
        "APPLE_SIGNER_CERT_PATH/APPLE_SIGNER_KEY_PATH doivent être des PEM. Convertis le .p12 en cert+key PEM."
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
