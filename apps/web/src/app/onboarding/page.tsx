"use client";

/**
 * Page d'onboarding — configuration initiale de l'établissement.
 * Appelée juste après la création du compte (/setup).
 *
 * Étape 1 : Nom et type de l'établissement
 * Étape 2 : Configuration du programme de fidélité
 *
 * Appels API :
 *  PATCH /api/v1/business          → met à jour le nom de l'établissement
 *  PATCH /api/v1/business/programs/:id → met à jour le seuil de tampons et la récompense
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2;

interface BusinessData {
  id: string;
  name: string;
  programs: Array<{ id: string; config_json: Record<string, unknown> }>;
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Données récupérées depuis l'API au montage
  const [business, setBusiness] = useState<BusinessData | null>(null);

  // Formulaire étape 1 — établissement
  const [businessName, setBusinessName] = useState("");
  const [establishmentType, setEstablishmentType] = useState("salon_coiffure");

  // Formulaire étape 2 — programme fidélité
  const [stampThreshold, setStampThreshold] = useState("10");
  const [rewardLabel, setRewardLabel] = useState("10€ de réduction");

  // Récupérer les données existantes du business pour pré-remplir
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
      return;
    }

    fetch(`${API_URL}/api/v1/business`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data: BusinessData) => {
        setBusiness(data);
        if (data.name && data.name !== "Mon établissement") {
          setBusinessName(data.name);
        }
        const program = data.programs?.[0];
        if (program?.config_json) {
          const cfg = program.config_json as { threshold?: number; reward_label?: string };
          if (cfg.threshold) setStampThreshold(String(cfg.threshold));
          if (cfg.reward_label) setRewardLabel(cfg.reward_label);
        }
      })
      .catch(() => {
        // Pas bloquant — on continue avec les valeurs par défaut
      });
  }, [router]);

  // ─── Étape 1 → 2 ──────────────────────────────────────────────────────────

  function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    if (businessName.trim().length < 2) {
      setError("Le nom doit faire au moins 2 caractères.");
      return;
    }
    setError(null);
    setStep(2);
  }

  // ─── Étape 2 → Soumettre ──────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const threshold = parseInt(stampThreshold, 10);
    if (isNaN(threshold) || threshold < 1 || threshold > 50) {
      setError("Le nombre de tampons doit être entre 1 et 50.");
      return;
    }
    if (rewardLabel.trim().length < 2) {
      setError("Décrivez la récompense (ex: 10€ de réduction).");
      return;
    }

    setLoading(true);
    setError(null);

    const token = localStorage.getItem("access_token");

    try {
      // 1. Mettre à jour le nom du business
      const bizRes = await fetch(`${API_URL}/api/v1/business`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: businessName,
          settings_json: { plan: "pro", establishment_type: establishmentType },
        }),
      });

      if (!bizRes.ok) {
        const data = await bizRes.json();
        setError(data.message ?? "Erreur lors de la mise à jour de l'établissement.");
        return;
      }

      // 2. Mettre à jour le programme fidélité (si un programme existe)
      const programId = business?.programs?.[0]?.id;
      if (programId) {
        const progRes = await fetch(`${API_URL}/api/v1/business/programs/${programId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: "Carte fidélité",
            config: { threshold, reward_label: rewardLabel.trim() },
          }),
        });

        if (!progRes.ok) {
          const data = await progRes.json();
          setError(data.message ?? "Erreur lors de la configuration du programme.");
          return;
        }
      }

      // Tout s'est bien passé → tableau de bord
      router.push("/dashboard");
    } catch {
      setError("Impossible de contacter l'API.");
    } finally {
      setLoading(false);
    }
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-lg w-full p-8 bg-white rounded-xl shadow space-y-6">

        {/* En-tête + indicateur de progression */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <StepDot active={step >= 1} done={step > 1} label="1" />
            <div className="flex-1 h-px bg-gray-200" />
            <StepDot active={step >= 2} done={false} label="2" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {step === 1 ? "Votre établissement" : "Programme de fidélité"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {step === 1
              ? "Donnez un nom à votre établissement."
              : "Configurez les règles de votre carte de fidélité."}
          </p>
        </div>

        {/* ── Étape 1 : nom + type ── */}
        {step === 1 && (
          <form onSubmit={handleStep1} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom de l'établissement
              </label>
              <input
                type="text"
                required
                minLength={2}
                placeholder="Ex : Salon Élégance"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type d'établissement
              </label>
              <select
                value={establishmentType}
                onChange={(e) => setEstablishmentType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="salon_coiffure">Salon de coiffure</option>
                <option value="barbier">Barbier</option>
                <option value="institut_beaute">Institut de beauté</option>
                <option value="spa">Spa / Bien-être</option>
                <option value="restaurant">Restaurant</option>
                <option value="cafe">Café / Boulangerie</option>
                <option value="autre">Autre</option>
              </select>
            </div>

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Continuer →
            </button>
          </form>
        )}

        {/* ── Étape 2 : programme fidélité ── */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre de tampons pour une récompense
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={50}
                  required
                  value={stampThreshold}
                  onChange={(e) => setStampThreshold(e.target.value)}
                  className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500">tampons</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                En général : 10 tampons pour un soin gratuit.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description de la récompense
              </label>
              <input
                type="text"
                required
                placeholder="Ex : 10€ de réduction, 1 soin offert…"
                value={rewardLabel}
                onChange={(e) => setRewardLabel(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Aperçu rapide */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
              <strong>{businessName}</strong> — après{" "}
              <strong>{stampThreshold} tampons</strong>, vos clients reçoivent :{" "}
              <strong>{rewardLabel}</strong>.
            </div>

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setError(null); setStep(1); }}
                className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                ← Retour
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Enregistrement…" : "Terminer →"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Composant indicateur d'étape ─────────────────────────────────────────────

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
        done
          ? "bg-green-500 text-white"
          : active
          ? "bg-blue-600 text-white"
          : "bg-gray-200 text-gray-500"
      }`}
    >
      {done ? "✓" : label}
    </div>
  );
}
