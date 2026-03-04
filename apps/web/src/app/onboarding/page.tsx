"use client";

/**
 * Page d'onboarding — wizard 3 étapes pour la configuration initiale.
 *
 * Étape 1 : Nom + type d'établissement (avec Google autocomplete)
 *            → Le nom sera verrouillé en base à la soumission finale.
 * Étape 2 : Logo (skippable) — photos Google ou upload fichier
 * Étape 3 : Programme de fidélité — seuil de tampons + récompense
 *
 * Appels API :
 *  GET   /api/v1/business              → pré-remplissage
 *  PATCH /api/v1/business              → nom + type (déclenche name_locked: true)
 *  PATCH /api/v1/business              → logo_url (si logo sélectionné)
 *  PATCH /api/v1/business/programs/:id → seuil + récompense
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Upload, Trash2, Store, Search } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

interface BusinessData {
  id: string;
  name: string;
  programs: Array<{ id: string; config_json: Record<string, unknown> }>;
}

const ESTABLISHMENT_TYPES = [
  { value: "salon_coiffure",  label: "Salon de coiffure" },
  { value: "barbier",         label: "Barbier" },
  { value: "institut_beaute", label: "Institut de beauté" },
  { value: "spa",             label: "Spa / Bien-être" },
  { value: "onglerie",        label: "Onglerie / Nail art" },
  { value: "restaurant",      label: "Restaurant" },
  { value: "cafe",            label: "Café / Boulangerie" },
  { value: "boutique",        label: "Boutique / Commerce" },
  { value: "autre",           label: "Autre" },
];

const inputClass =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

// ─── Composant principal ──────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Données business récupérées au montage
  const [business, setBusiness] = useState<BusinessData | null>(null);

  // ── Étape 1 : établissement ──────────────────────────────────────────────
  const [businessName, setBusinessName]     = useState("");
  const [establishmentType, setEstType]     = useState("salon_coiffure");

  // Google My Business autocomplete
  const [gmbResults, setGmbResults]         = useState<Array<{ place_id: string; name: string; address: string; type: string }>>([]);
  const [gmbLoading, setGmbLoading]         = useState(false);
  const [gmbOpen, setGmbOpen]               = useState(false);
  const [gmbPhotos, setGmbPhotos]           = useState<string[]>([]);
  const gmbTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Étape 2 : logo ──────────────────────────────────────────────────────
  const [selectedLogoUrl, setSelectedLogoUrl] = useState<string | null>(null); // URL Google choisie
  const [logoUploading, setLogoUploading]     = useState(false);
  const [logoPreview, setLogoPreview]         = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Étape 3 : programme ──────────────────────────────────────────────────
  const [stampThreshold, setStampThreshold] = useState("10");
  const [rewardLabel, setRewardLabel]       = useState("10€ de réduction");

  // Pré-remplissage depuis l'API
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { router.push("/login"); return; }

    fetch(`${API_URL}/api/v1/business`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data: BusinessData) => {
        setBusiness(data);
        if (data.name && data.name !== "Mon établissement") {
          setBusinessName(data.name);
        }
        const cfg = data.programs?.[0]?.config_json as { threshold?: number; reward_label?: string } | undefined;
        if (cfg?.threshold) setStampThreshold(String(cfg.threshold));
        if (cfg?.reward_label) setRewardLabel(cfg.reward_label);
      })
      .catch(() => {});
  }, [router]);

  // ── Recherche Google My Business ─────────────────────────────────────────

  function handleGmbInput(value: string) {
    if (gmbTimeout.current) clearTimeout(gmbTimeout.current);
    if (value.trim().length < 2) { setGmbResults([]); return; }

    gmbTimeout.current = setTimeout(async () => {
      setGmbLoading(true);
      const token = localStorage.getItem("access_token");
      try {
        const res = await fetch(
          `${API_URL}/api/v1/business/places/search?query=${encodeURIComponent(value)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) setGmbResults(await res.json());
      } catch {
        // silencieux
      } finally {
        setGmbLoading(false);
      }
    }, 400);
  }

  async function selectGmbPlace(placeId: string) {
    setGmbResults([]);
    setGmbLoading(true);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(
        `${API_URL}/api/v1/business/places/details?place_id=${placeId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return;
      const details = await res.json() as {
        name?: string; address?: string; phone?: string; type?: string; photo_urls?: string[];
      };
      if (details.name) setBusinessName(details.name);
      if (details.type) setEstType(details.type);
      const photos = details.photo_urls ?? [];
      setGmbPhotos(photos);
      setGmbOpen(false);
    } finally {
      setGmbLoading(false);
    }
  }

  // ── Logo upload (fichier) ────────────────────────────────────────────────

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/jpeg", "image/png", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Format non supporté. Utilisez JPG, PNG, SVG ou WEBP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Fichier trop volumineux (max 2 Mo).");
      return;
    }

    setError(null);
    setLogoPreview(URL.createObjectURL(file));
    setSelectedLogoUrl(null); // annule sélection Google si présente

    const token = localStorage.getItem("access_token");
    const formData = new FormData();
    formData.append("file", file);

    setLogoUploading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/business/logo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setLogoPreview(data.logo_url);
        setSelectedLogoUrl(data.logo_url);
      } else {
        setError(data.message ?? "Erreur lors de l'upload.");
        setLogoPreview(null);
      }
    } catch {
      setError("Impossible de contacter l'API.");
      setLogoPreview(null);
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  function selectGmbPhoto(url: string) {
    setSelectedLogoUrl(url);
    setLogoPreview(url);
  }

  // ── Navigation entre étapes ──────────────────────────────────────────────

  function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (businessName.trim().length < 2) {
      setError("Le nom doit faire au moins 2 caractères.");
      return;
    }
    setStep(2);
  }

  function goToStep3() {
    setError(null);
    setStep(3);
  }

  // ── Soumission finale (étape 3) ──────────────────────────────────────────

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
      // 1. Sauvegarder le nom + type → déclenche name_locked: true côté backend
      const bizRes = await fetch(`${API_URL}/api/v1/business`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: businessName.trim(),
          settings_json: { establishment_type: establishmentType },
        }),
      });

      if (!bizRes.ok) {
        const data = await bizRes.json();
        setError(data.message ?? "Erreur lors de la mise à jour de l'établissement.");
        return;
      }

      // 2. Si logo Google sélectionné (le fichier est déjà uploadé en temps réel)
      if (selectedLogoUrl && !selectedLogoUrl.startsWith("blob:")) {
        const isGoogleUrl = selectedLogoUrl.includes("maps.googleapis") || selectedLogoUrl.includes("googleusercontent");
        if (isGoogleUrl) {
          await fetch(`${API_URL}/api/v1/business`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ logo_url: selectedLogoUrl }),
          });
        }
      }

      // 3. Mettre à jour le programme fidélité
      const programId = business?.programs?.[0]?.id;
      if (programId) {
        const progRes = await fetch(`${API_URL}/api/v1/business/programs/${programId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

      router.push("/dashboard");
    } catch {
      setError("Impossible de contacter l'API.");
    } finally {
      setLoading(false);
    }
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-lg">

        {/* Barre de progression */}
        <div className="flex items-center gap-0 mb-8">
          <StepDot step={1} current={step} label="Établissement" />
          <div className={`flex-1 h-0.5 transition-colors ${step > 1 ? "bg-green-400" : "bg-gray-200"}`} />
          <StepDot step={2} current={step} label="Logo" />
          <div className={`flex-1 h-0.5 transition-colors ${step > 2 ? "bg-green-400" : "bg-gray-200"}`} />
          <StepDot step={3} current={step} label="Programme" />
        </div>

        {/* Carte principale */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

          {/* En-tête */}
          <div className="px-8 pt-8 pb-6 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                Étape {step} sur 3
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              {step === 1 && "Votre établissement"}
              {step === 2 && "Votre logo"}
              {step === 3 && "Programme de fidélité"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {step === 1 && "Donnez un nom à votre établissement. Ce nom sera permanent."}
              {step === 2 && "Ajoutez un logo pour personnaliser votre carte fidélité."}
              {step === 3 && "Définissez les règles de votre programme de tampons."}
            </p>
          </div>

          {/* Contenu */}
          <div className="px-8 py-6">

            {/* ══ Étape 1 : nom + type ══ */}
            {step === 1 && (
              <form onSubmit={handleStep1} className="space-y-5">

                {/* Champ nom avec Google autocomplete */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom de l'établissement
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      minLength={2}
                      placeholder="Ex : Salon Élégance, BB Dynasty…"
                      value={businessName}
                      onChange={(e) => {
                        setBusinessName(e.target.value);
                        setGmbOpen(true);
                        handleGmbInput(e.target.value);
                      }}
                      onFocus={() => { if (businessName.trim().length >= 2) setGmbOpen(true); }}
                      onBlur={() => setTimeout(() => setGmbOpen(false), 150)}
                      className={inputClass}
                      autoFocus
                    />
                    {gmbLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>

                  {/* Badge Google */}
                  <div className="mt-1.5 flex items-center gap-1">
                    <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span className="text-xs text-gray-400">Suggestions Google My Business</span>
                  </div>

                  {/* Dropdown résultats */}
                  {gmbOpen && gmbResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {gmbResults.map((r) => (
                        <button
                          key={r.place_id}
                          type="button"
                          onClick={() => selectGmbPlace(r.place_id)}
                          className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                        >
                          <Search className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                            <p className="text-xs text-gray-400 truncate">{r.address}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Type d'établissement */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type d'établissement
                  </label>
                  <select
                    value={establishmentType}
                    onChange={(e) => setEstType(e.target.value)}
                    className={inputClass}
                  >
                    {ESTABLISHMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Warning verrouillage */}
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5">
                  <span className="text-base mt-0.5" aria-hidden="true">🔒</span>
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Ce nom sera permanent</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Il déterminera l'URL de votre QR code d'inscription (
                      <code className="font-mono">/join/...</code>). Vous ne pourrez plus le modifier
                      après avoir terminé l'installation.
                    </p>
                  </div>
                </div>

                {error && <ErrorBox message={error} />}

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Continuer →
                </button>
              </form>
            )}

            {/* ══ Étape 2 : logo ══ */}
            {step === 2 && (
              <div className="space-y-5">

                {/* Photos Google si disponibles */}
                {gmbPhotos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Photos de votre établissement sur Google
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {gmbPhotos.map((url, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => selectGmbPhoto(url)}
                          className={`relative aspect-square rounded-xl overflow-hidden border-2 hover:scale-[1.02] transition-all group ${
                            selectedLogoUrl === url
                              ? "border-blue-500 ring-2 ring-blue-200"
                              : "border-gray-200 hover:border-blue-400"
                          }`}
                        >
                          <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                          {selectedLogoUrl === url && (
                            <div className="absolute inset-0 bg-blue-600/20 flex items-center justify-center">
                              <CheckCircle className="h-6 w-6 text-white drop-shadow" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload fichier */}
                <div>
                  {gmbPhotos.length > 0 && (
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Ou uploader votre propre logo
                    </p>
                  )}

                  <div className="flex items-center gap-4">
                    {/* Aperçu */}
                    {logoPreview ? (
                      <div className="relative shrink-0">
                        <img
                          src={logoPreview}
                          alt="Logo"
                          className="w-20 h-20 rounded-xl object-cover border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => { setLogoPreview(null); setSelectedLogoUrl(null); }}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        {logoUploading && (
                          <div className="absolute inset-0 rounded-xl bg-white/80 flex items-center justify-center">
                            <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        onClick={() => logoInputRef.current?.click()}
                        className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 cursor-pointer hover:border-blue-400 hover:text-blue-500 transition-colors shrink-0"
                      >
                        <Store className="h-6 w-6" />
                        <span className="text-xs">Logo</span>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <button
                        type="button"
                        disabled={logoUploading}
                        onClick={() => logoInputRef.current?.click()}
                        className="inline-flex items-center gap-2 py-1.5 px-3 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        <Upload className="h-4 w-4" />
                        {logoUploading ? "Upload en cours…" : logoPreview ? "Changer" : "Choisir un fichier"}
                      </button>
                      <p className="text-xs text-gray-400">JPG, PNG, SVG, WEBP — max 2 Mo</p>
                    </div>
                  </div>

                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/svg+xml,image/webp"
                    onChange={handleLogoFile}
                    className="hidden"
                  />
                </div>

                {error && <ErrorBox message={error} />}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setError(null); setStep(1); }}
                    className="py-2 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    ← Retour
                  </button>
                  <button
                    type="button"
                    onClick={goToStep3}
                    disabled={logoUploading}
                    className="flex-1 py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {logoPreview ? "Continuer →" : "Passer cette étape →"}
                  </button>
                </div>
              </div>
            )}

            {/* ══ Étape 3 : programme fidélité ══ */}
            {step === 3 && (
              <form onSubmit={handleSubmit} className="space-y-5">

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
                    En général : 10 tampons pour un soin gratuit ou une réduction.
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
                    className={inputClass}
                  />
                </div>

                {/* Aperçu */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                  <p className="font-semibold mb-0.5">{businessName || "Votre établissement"}</p>
                  <p>
                    Après <strong>{stampThreshold || "?"} tampons</strong>, vos clients
                    reçoivent : <strong>{rewardLabel || "…"}</strong>
                  </p>
                </div>

                {error && <ErrorBox message={error} />}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setError(null); setStep(2); }}
                    className="py-2 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    ← Retour
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {loading ? "Enregistrement…" : "Terminer et accéder au dashboard →"}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Composants utilitaires ───────────────────────────────────────────────────

function StepDot({ step, current, label }: { step: number; current: number; label: string }) {
  const done   = current > step;
  const active = current === step;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
          done
            ? "bg-green-500 text-white"
            : active
            ? "bg-blue-600 text-white shadow-md shadow-blue-200"
            : "bg-gray-100 text-gray-400"
        }`}
      >
        {done ? "✓" : step}
      </div>
      <span className={`text-xs font-medium ${active ? "text-blue-600" : done ? "text-green-600" : "text-gray-400"}`}>
        {label}
      </span>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
      {message}
    </div>
  );
}
