/**
 * CustomerService
 * Gestion des clients : création, liste paginée, détail.
 *
 * Chaque client reçoit un qr_secret aléatoire à la création.
 * Ce secret est utilisé pour signer le QR code (HMAC-SHA256) afin
 * qu'un client ne puisse pas forger le QR d'un autre client.
 */

import crypto from "node:crypto";
import { prisma } from "@loyalty/database";

interface CreateCustomerInput {
  name: string;
  phone?: string;
  email?: string;
}

interface ListOptions {
  search?: string;
  page: number;
  per_page: number;
}

export class CustomerService {
  /**
   * Crée un nouveau client avec un QR secret aléatoire.
   */
  async create(businessId: string, input: CreateCustomerInput) {
    // Vérifier l'unicité de l'email pour ce business
    if (input.email) {
      const existing = await prisma.customer.findFirst({
        where: { business_id: businessId, email: input.email },
        select: { id: true },
      });
      if (existing) {
        throw Object.assign(new Error("Un client avec cet email existe déjà dans votre établissement."), { code: "EMAIL_TAKEN" });
      }
    }

    const qrSecret = crypto.randomBytes(32).toString("hex");

    const customer = await prisma.customer.create({
      data: {
        business_id: businessId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        qr_secret: qrSecret,
      },
    });

    return this.formatCustomer(customer);
  }

  /**
   * Liste paginée avec recherche sur nom / téléphone.
   */
  async list(businessId: string, options: ListOptions) {
    const { search, page, per_page } = options;
    const skip = (page - 1) * per_page;

    const where = {
      business_id: businessId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [customers, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        skip,
        take: per_page,
        orderBy: { created_at: "desc" },
        include: { program: { select: { name: true, config_json: true } } },
      }),
      prisma.customer.count({ where }),
    ]);

    return {
      data: customers.map(this.formatCustomer.bind(this)),
      total,
      page,
      per_page,
    };
  }

  /**
   * Détail d'un client avec ses 20 dernières transactions et ses passes wallet.
   */
  async getById(businessId: string, customerId: string) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, business_id: businessId },
      include: {
        transactions: {
          orderBy: { created_at: "desc" },
          take: 20,
        },
        wallet_passes: {
          select: { platform: true, serial: true, last_version: true },
        },
        program: { select: { name: true, config_json: true } },
      },
    });

    if (!customer) return null;

    return {
      ...this.formatCustomer(customer),
      transactions: customer.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        delta: t.delta,
        note: t.note,
        source: t.source,
        performed_by_name: t.performed_by_name,
        created_at: t.created_at.toISOString(),
      })),
      wallet_passes: customer.wallet_passes,
    };
  }

  // ─── Helpers privés ─────────────────────────────────────────────────────────

  /**
   * Génère l'URL du QR code pour un client.
   * En prod, cette URL pointe vers un endpoint public qui affiche le QR
   * (par exemple une page Next.js /qr/:customerId?sig=<hmac>).
   */
  private formatCustomer(customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    stamp_count: number;
    point_count: number;
    created_at: Date;
    program_id?: string | null;
    program?: { name: string; config_json?: unknown } | null;
  }) {
    const appUrl = process.env["APP_URL"] ?? "http://localhost:3000";
    const threshold = this.extractStampThreshold(customer.program?.config_json);
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      stamp_count: customer.stamp_count,
      point_count: customer.point_count,
      qr_url: `${appUrl}/scan/${customer.id}`,
      created_at: customer.created_at.toISOString(),
      program_id: customer.program_id ?? null,
      program_name: customer.program?.name ?? null,
      program_threshold: threshold,
    };
  }

  private extractStampThreshold(config: unknown): number | null {
    if (!config || typeof config !== "object") return null;
    const candidate = (config as { threshold?: unknown }).threshold;
    return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
  }
}
