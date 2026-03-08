/**
 * AuthService
 * Gère la logique d'authentification : hash bcrypt, vérification, émission JWT.
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@loyalty/database";

const JWT_SECRET = process.env["JWT_SECRET"] ?? "dev-secret";
const JWT_EXPIRES_IN = process.env["JWT_EXPIRES_IN"] ?? "15m";
const JWT_REFRESH_SECRET = process.env["JWT_REFRESH_SECRET"] ?? "dev-refresh-secret";
const JWT_REFRESH_EXPIRES_IN = process.env["JWT_REFRESH_EXPIRES_IN"] ?? "30d";

export class AuthService {
  private mapRole(role: string): "OWNER" | "STAFF" {
    return role === "ADMIN" || role === "OWNER" ? "OWNER" : "STAFF";
  }

  /**
   * Vérifie les credentials et retourne les tokens si valides.
   */
  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { business: true },
    });

    if (!user) return null;

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) return null;

    const mappedRole = this.mapRole(user.role);
    const accessToken = this.signAccessToken(user.id, user.business_id, mappedRole);
    const refreshToken = this.signRefreshToken(user.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: mappedRole,
        business_id: user.business_id,
        business_name: user.business.name,
      },
    };
  }

  /**
   * Rafraîchit l'access token à partir d'un refresh token valide.
   */
  async refreshToken(token: string) {
    try {
      const payload = jwt.verify(token, JWT_REFRESH_SECRET) as { sub: string };
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return null;

      const accessToken = this.signAccessToken(user.id, user.business_id, this.mapRole(user.role));
      return { access_token: accessToken };
    } catch {
      return null;
    }
  }

  /**
   * Retourne le profil complet de l'utilisateur connecté.
   */
  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { business: true },
    });

    if (!user) return null;

    const activeProgramsCount = await prisma.program.count({
      where: {
        business_id: user.business.id,
        status: "ACTIVE",
      },
    });
    const businessNameSet = user.business.name.trim().length >= 2;
    const missingSteps: string[] = [];
    if (!businessNameSet) missingSteps.push("business_profile");
    if (activeProgramsCount === 0) missingSteps.push("first_program");

    return {
      id: user.id,
      email: user.email,
      role: this.mapRole(user.role),
      business: {
        id: user.business.id,
        name: user.business.name,
        slug: user.business.slug,
        logo_url: user.business.logo_url,
        plan: user.business.plan,
        settings: user.business.settings_json,
      },
      setup: {
        business_name_set: businessNameSet,
        has_active_program: activeProgramsCount > 0,
        requires_onboarding: missingSteps.length > 0,
        missing_steps: missingSteps,
      },
    };
  }

  /**
   * Hache un mot de passe (utilisé à la création de compte).
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  /**
   * Vérifie si un mot de passe en clair correspond au hash stocké.
   */
  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  // ─── Helpers privés ─────────────────────────────────────────────────────────

  private signAccessToken(userId: string, businessId: string, role: "OWNER" | "STAFF") {
    return jwt.sign(
      { sub: userId, business_id: businessId, role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );
  }

  private signRefreshToken(userId: string) {
    return jwt.sign(
      { sub: userId },
      JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions
    );
  }
}
