/**
 * @loyalty/types
 *
 * Types TypeScript partagés entre apps/api et apps/web.
 * Ces types décrivent les contrats d'API (request/response bodies),
 * pas les modèles Prisma (qui sont dans @loyalty/database).
 */

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    role: string;
    business_id: string;
  };
}

export interface MeResponse {
  id: string;
  email: string;
  role: string;
  business: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRAMS
// ─────────────────────────────────────────────────────────────────────────────

export interface StampProgramConfig {
  threshold: number;      // ex. 10 tampons pour déclencher la récompense
  reward_label: string;   // ex. "10€ de réduction"
}

export interface PointsProgramConfig {
  rate: number;           // ex. 1 (1€ = 1 point)
  tiers: Array<{
    points: number;       // seuil en points
    reward: string;       // description de la récompense
  }>;
}

export type ProgramConfig = StampProgramConfig | PointsProgramConfig;

export interface CreateProgramRequest {
  name: string;
  type: "STAMPS" | "POINTS";
  config: ProgramConfig;
}

export interface ProgramResponse {
  id: string;
  name: string;
  type: "STAMPS" | "POINTS";
  config: ProgramConfig;
  active: boolean;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMERS
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateCustomerRequest {
  name: string;
  phone: string;
  email: string;
}

export interface UpdateCustomerRequest {
  name: string;
  phone: string;
  email: string;
}

export interface CustomerResponse {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  stamp_count: number;
  point_count: number;
  qr_url: string; // URL affichant le QR code du client
  created_at: string;
  program_id: string | null;    // programme auquel le client est inscrit
  program_name: string | null;  // nom du programme (null si aucun / ancien client)
  program_threshold: number | null; // seuil de tampons du programme du client
}

export interface CustomerDetailResponse extends CustomerResponse {
  transactions: TransactionResponse[];
  wallet_passes: Array<{
    platform: "APPLE" | "GOOGLE";
    serial: string;
    last_version: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface TransactionResponse {
  id: string;
  type: string;
  delta: number;
  note: string | null;
  source: string | null;
  performed_by_name: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAMPS / REWARDS
// ─────────────────────────────────────────────────────────────────────────────

export interface StampRequest {
  program_id: string;
  note?: string;
}

export interface StampResponse {
  customer: CustomerResponse;
  transaction: TransactionResponse;
  reward_unlocked: boolean; // true si on vient d'atteindre le seuil
}

export interface RedeemRequest {
  program_id: string;
  note?: string;
}

export interface RedeemResponse {
  customer: CustomerResponse;
  transaction: TransactionResponse;
}

// ─────────────────────────────────────────────────────────────────────────────
// WALLET
// ─────────────────────────────────────────────────────────────────────────────

export interface GoogleWalletJwtResponse {
  jwt: string;
  save_url: string; // "https://pay.google.com/gp/v/save/{jwt}"
}

// ─────────────────────────────────────────────────────────────────────────────
// AI
// ─────────────────────────────────────────────────────────────────────────────

export interface CleanLogoRequest {
  /** URL de l'image à nettoyer (déjà uploadée sur R2) */
  source_url: string;
  instructions?: string; // ex. "fond transparent, upscale x2"
}

export interface GeneratePassDesignRequest {
  /** Description du style de l'établissement */
  style_prompt: string; // ex. "barber premium urban, couleurs sombres"
  /** Nombre de variantes à générer (max 3) */
  variants?: number;
}

export interface GeneratePromoAssetsRequest {
  /** Texte principal de la promo */
  promo_text: string;
  /** URL du logo à intégrer */
  logo_url?: string;
  assets: Array<"story_ig" | "poster_a4" | "coupon">;
}

export interface AiJobResponse {
  id: string;
  type: string;
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  assets: Array<{
    kind: string;
    url: string;
  }>;
  error_message: string | null;
  cost_estimate: number | null;
  created_at: string;
  completed_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMON
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}
