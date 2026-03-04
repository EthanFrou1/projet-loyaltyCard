"use client";

/**
 * Public join page scanned from business QR.
 * Supports selecting a loyalty program when multiple are active.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface JoinProgram {
  id: string;
  name: string;
  type: "STAMPS" | "POINTS";
  threshold: number;
  reward_label: string;
  background_color: string | null;
  text_color: "light" | "dark";
}

interface BusinessInfo {
  name: string;
  logo_url: string | null;
  slug: string;
  threshold: number;
  reward_label: string;
  default_program_id: string | null;
  programs: JoinProgram[];
}

export default function JoinPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const presetProgramId = searchParams.get("programId") ?? searchParams.get("program_id");

  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation côté client pour activer le bouton
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneValid  = phoneDigits.length === 10;
  const isFormValid =
    firstName.trim().length >= 1 &&
    lastName.trim().length >= 1 &&
    emailValid &&
    phoneValid &&
    consent;

  const hasPresetProgram = Boolean(presetProgramId);

  const visiblePrograms = useMemo(() => {
    if (!business) return [];
    if (!hasPresetProgram || !selectedProgramId) return business.programs ?? [];
    return (business.programs ?? []).filter((p) => p.id === selectedProgramId);
  }, [business, hasPresetProgram, selectedProgramId]);

  useEffect(() => {
    const joinUrl = presetProgramId
      ? `${API_URL}/api/v1/join/${slug}?program_id=${encodeURIComponent(presetProgramId)}`
      : `${API_URL}/api/v1/join/${slug}`;

    fetch(joinUrl)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: BusinessInfo) => {
        setBusiness(data);
        const ids = new Set((data.programs ?? []).map((p) => p.id));
        if (presetProgramId && ids.has(presetProgramId)) {
          setSelectedProgramId(presetProgramId);
          return;
        }
        setSelectedProgramId(data.default_program_id ?? data.programs?.[0]?.id ?? null);
      })
      .catch(() => setNotFound(true));
  }, [slug, presetProgramId]);

  const selectedProgram = useMemo(() => {
    if (!business || !selectedProgramId) return null;
    return business.programs.find((p) => p.id === selectedProgramId) ?? null;
  }, [business, selectedProgramId]);

  // Couleurs de marque du programme sélectionné
  const brandColor  = selectedProgram?.background_color ?? "#2563eb"; // blue-600 par défaut
  const isDarkText  = selectedProgram?.text_color === "dark";
  const textOnBrand = isDarkText ? "#111827" : "#ffffff";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/v1/join/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          ...(selectedProgramId && { program_id: selectedProgramId }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "Une erreur est survenue.");
        return;
      }

      router.push(`/welcome/${data.id}?slug=${slug}&new=${!data.already_registered}`);
    } catch {
      setError("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <p className="text-4xl mb-4">Search</p>
          <h1 className="text-xl font-bold text-gray-900">Établissement introuvable</h1>
          <p className="text-sm text-gray-500 mt-2">
            Ce lien n'est pas valide. Demandez le QR code à votre commerçant.
          </p>
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          {business.logo_url ? (
            <img
              src={business.logo_url}
              alt={business.name}
              className="w-20 h-20 rounded-2xl object-cover mx-auto shadow-sm"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto text-3xl">
              Shop
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900">{business.name}</h1>
            <p className="text-sm text-gray-500 mt-1">Créez votre carte fidélité gratuite</p>
          </div>

          <div
            className="rounded-xl px-4 py-3 text-sm font-medium"
            style={{
              backgroundColor: brandColor + "22", // ~13% opacité
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: brandColor + "55",     // ~33% opacité
              color: brandColor,
            }}
          >
            <span className="font-semibold">{selectedProgram?.threshold ?? business.threshold} tampons</span>
            <span> = </span>
            <span>{selectedProgram?.reward_label ?? business.reward_label}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!hasPresetProgram && (business.programs?.length ?? 0) > 1 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Programme de fidélité *</label>
                <select
                  value={selectedProgramId ?? ""}
                  onChange={(e) => setSelectedProgramId(e.target.value || null)}
                  className={inputClass}
                  required
                >
                  {visiblePrograms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - {p.threshold} tampons = {p.reward_label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Prénom *</label>
                <input
                  type="text"
                  required
                  placeholder="Marie"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputClass}
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nom *</label>
                <input
                  type="text"
                  required
                  placeholder="Dupont"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={inputClass}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                required
                placeholder="marie@exemple.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                autoComplete="email"
              />
              <p className="text-xs text-gray-400 mt-1">
                Pour retrouver votre carte si vous changez de téléphone.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Téléphone *
              </label>
              <input
                type="tel"
                placeholder="06 12 34 56 78"
                value={phone}
                onChange={(e) => {
                  // Autoriser uniquement chiffres et espaces, max 10 chiffres
                  const raw = e.target.value.replace(/[^\d\s]/g, "");
                  const digits = raw.replace(/\s/g, "");
                  if (digits.length <= 10) setPhone(raw);
                }}
                className={`${inputClass} ${phone && !phoneValid ? "border-red-400 focus:ring-red-400" : ""}`}
                autoComplete="tel"
                inputMode="tel"
              />
              {phone && !phoneValid && (
                <p className="text-xs text-red-500 mt-1">Numéro invalide - 10 chiffres requis.</p>
              )}
            </div>

            {/* Case RGPD */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
              />
              <span className="text-xs text-gray-500 leading-relaxed">
                J'accepte que mes données (nom, email, téléphone) soient conservées
                par <strong>{business.name}</strong> pour gérer ma carte fidélité.
                Elles ne seront jamais partagées à des tiers.
              </span>
            </label>

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!isFormValid || loading}
              className="w-full py-3 px-4 font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-opacity text-sm"
              style={{ backgroundColor: brandColor, color: textOnBrand }}
            >
              {loading ? "Création de votre carte..." : "Obtenir ma carte fidélité ->"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

