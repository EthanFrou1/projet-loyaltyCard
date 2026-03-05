/**
 * Client API centralisé
 *
 * Toutes les requêtes vers l'API Fastify passent par ce module.
 * - Injecte automatiquement le Bearer token
 * - Gère les erreurs HTTP
 * - TODO : gestion du refresh token sur 401
 */

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";
const API_PREFIX = "/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_URL}${API_PREFIX}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    // Session expirée sur une page authentifiée → rediriger vers login
    const isAuthPage = typeof window !== "undefined" &&
      (window.location.pathname.startsWith("/login") || window.location.pathname.startsWith("/setup"));
    if (!isAuthPage && typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
    }
    throw new Error("Session expirée, veuillez vous reconnecter.");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// Envoi d'un FormData (upload fichier) — sans Content-Type, le navigateur gère le boundary
async function requestForm<T = unknown>(path: string, form: FormData): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_URL}${API_PREFIX}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (res.status === 401) {
    const isAuthPage = typeof window !== "undefined" &&
      (window.location.pathname.startsWith("/login") || window.location.pathname.startsWith("/setup"));
    if (!isAuthPage && typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
    }
    throw new Error("Session expirée, veuillez vous reconnecter.");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T = unknown>(path: string) => request<T>("GET", path),
  post: <T = unknown>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T = unknown>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T = unknown>(path: string) => request<T>("DELETE", path),
  postForm: <T = unknown>(path: string, form: FormData) => requestForm<T>(path, form),
};
