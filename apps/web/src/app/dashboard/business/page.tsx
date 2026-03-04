"use client";

/**
 * Page Mon établissement — configuration complète du business.
 *
 * Sections :
 *  1. Informations générales  → nom, type, adresse, téléphone
 *  2. Programme de fidélité   → seuil de tampons et description de la récompense
 *  3. Apparence               → logo (à venir)
 *
 * Appels API :
 *  GET   /api/v1/business              → charger les données actuelles
 *  PATCH /api/v1/business              → mettre à jour les infos générales
 *  PATCH /api/v1/business/programs/:id → mettre à jour le programme (versioning)
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, Circle, Store, Star, Palette, MapPin, Phone, QrCode, Copy, Check, Upload, Trash2, Search, ArrowRight, Stamp, Lock } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { apiClient } from "@/lib/api-client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Program {
  id: string;
  name: string;
  version: number;
  status: "ACTIVE" | "ARCHIVED";
  created_at: string;
  config_json: { threshold?: number; reward_label?: string };
}

interface Business {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: "STARTER" | "PRO" | "BUSINESS";
  name_locked: boolean;
  settings_json: {
    establishment_type?: string;
    address?: string;
    phone?: string;
  } | null;
  programs: Program[];
}

const PLAN_LIMITS: Record<string, number> = { STARTER: 1, PRO: 3, BUSINESS: Infinity };

const ESTABLISHMENT_TYPES = [
  { value: "salon_coiffure", label: "Salon de coiffure" },
  { value: "barbier",        label: "Barbier" },
  { value: "institut_beaute",label: "Institut de beauté" },
  { value: "spa",            label: "Spa / Bien-être" },
  { value: "onglerie",       label: "Onglerie / Nail art" },
  { value: "restaurant",     label: "Restaurant" },
  { value: "cafe",           label: "Café / Boulangerie" },
  { value: "boutique",       label: "Boutique / Commerce" },
  { value: "autre",          label: "Autre" },
];

// ─── Composant principal ──────────────────────────────────────────────────────

export default function BusinessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loadError, setLoadError] = useState(false);

  // ── Formulaire section 1 ──
  const [name, setName]       = useState("");
  const [type, setType]       = useState("salon_coiffure");
  const [address, setAddress] = useState("");
  const [phone, setPhone]     = useState("");
  const [saving1, setSaving1] = useState(false);
  const [saved1, setSaved1]   = useState(false);
  const [error1, setError1]   = useState<string | null>(null);
  // Snapshot des valeurs sauvegardées pour détecter les changements
  const [savedSnap, setSavedSnap] = useState({ name: "", type: "salon_coiffure", address: "", phone: "" });


  // Charger les données depuis l'API
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    fetch(`${API_URL}/api/v1/business`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          router.push("/login");
          return null;
        }
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((data: Business | null) => {
        if (!data) return;
        setBusiness(data);
        const s = data.settings_json ?? {};
        const snap = {
          name:    data.name ?? "",
          type:    s.establishment_type ?? "salon_coiffure",
          address: s.address ?? "",
          phone:   s.phone ?? "",
        };
        setName(snap.name);
        setType(snap.type);
        setAddress(snap.address);
        setPhone(snap.phone);
        setSavedSnap(snap);

        // Scroll vers la section demandée via ?scroll=
        const target = searchParams.get("scroll");
        if (target) {
          // Léger délai pour que le DOM soit rendu
          setTimeout(() => scrollToSection(target), 100);
        }
      })
      .catch(() => setLoadError(true));
  }, []);

  // ── Sauvegarder les infos générales ─────────────────────────────────────────
  async function saveGeneralInfo(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError1("Le nom doit faire au moins 2 caractères.");
      return;
    }

    setSaving1(true);
    setError1(null);
    setSaved1(false);

    const token = localStorage.getItem("access_token");

    try {
      const res = await fetch(`${API_URL}/api/v1/business`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(),
          settings_json: {
            ...(business?.settings_json ?? {}),
            establishment_type: type,
            address: address.trim(),
            phone: phone.trim(),
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError1(data.message ?? "Erreur lors de la sauvegarde.");
        return;
      }

      // Mettre à jour le business (inclut le nouveau slug si le nom a changé)
      setBusiness((b) => b ? { ...b, ...data } : data);
      setSavedSnap({ name: name.trim(), type, address: address.trim(), phone: phone.trim() });
      setSaved1(true);
      setTimeout(() => setSaved1(false), 3000);
    } catch {
      setError1("Impossible de contacter l'API.");
    } finally {
      setSaving1(false);
    }
  }

  // ── Recherche Google My Business ────────────────────────────────────────────
  const [gmbResults, setGmbResults]           = useState<Array<{ place_id: string; name: string; address: string; type: string }>>([]);
  const [gmbLoading, setGmbLoading]           = useState(false);
  const [gmbOpen, setGmbOpen]                 = useState(false);
  const [gmbImported, setGmbImported]         = useState(false);
  const [gmbPhotos, setGmbPhotos]             = useState<string[]>([]);
  const [showPhotoModal, setShowPhotoModal]   = useState(false);
  const gmbTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleGmbInput(value: string) {
    setGmbImported(false);
    if (gmbTimeout.current) clearTimeout(gmbTimeout.current);
    if (value.trim().length < 2) { setGmbResults([]); return; }

    gmbTimeout.current = setTimeout(async () => {
      setGmbLoading(true);
      try {
        const results = await apiClient.get<Array<{ place_id: string; name: string; address: string; type: string }>>(
          `/business/places/search?query=${encodeURIComponent(value)}`
        );
        setGmbResults(results);
      } catch {
        // Silencieux (401 géré globalement par apiClient)
      } finally {
        setGmbLoading(false);
      }
    }, 400);
  }

  async function selectGmbPlace(placeId: string) {
    setGmbResults([]);
    setGmbLoading(true);
    try {
      const details = await apiClient.get<{
        name?: string; address?: string; phone?: string; type?: string; photo_urls?: string[];
      }>(`/business/places/details?place_id=${placeId}`);

      // Remplir le formulaire avec les données Google
      if (details.name)       setName(details.name);
      if (details.address)    setAddress(details.address);
      if (details.phone)      setPhone(details.phone);
      if (details.type)       setType(details.type);
      const photos = details.photo_urls ?? [];
      if (photos.length > 0) {
        setGmbPhotos(photos);
        setShowPhotoModal(true);
      }

      setGmbOpen(false);
      setGmbImported(true);
    } finally {
      setGmbLoading(false);
    }
  }

  async function applyGmbPhoto(url: string) {
    try {
      await apiClient.patch("/business", { logo_url: url });
      setBusiness((b) => b ? { ...b, logo_url: url } : b);
      setShowPhotoModal(false);
      setGmbPhotos([]);
    } catch {
      // silencieux
    }
  }

  // ── Régénérer le slug depuis le nom actuel ──────────────────────────────────
  async function regenerateSlug() {
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/v1/business`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ regenerate_slug: true }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setBusiness((b) => b ? { ...b, ...data } : data);
    } catch {
      // silencieux
    }
  }

  // ── Détection de changements dans le formulaire général ─────────────────────
  const nameLocked = business?.name_locked ?? false;
  const isDirty =
    (!nameLocked && name.trim() !== savedSnap.name) ||
    type           !== savedSnap.type    ||
    address.trim() !== savedSnap.address ||
    phone.trim()   !== savedSnap.phone;

  // ── Indicateur de progression ────────────────────────────────────────────────
  const step1Done = name.trim().length >= 2 && type !== "";
  const step2Done = (business?.programs?.filter((p) => p.status === "ACTIVE").length ?? 0) > 0;
  const step3Done = !!business?.logo_url;
  const allDone   = step1Done && step2Done && step3Done;

  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightedSection(id);
    setTimeout(() => setHighlightedSection(null), 2000);
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Impossible de charger les données. Rechargez la page.</p>
      </div>
    );
  }

  const activePrograms = business?.programs?.filter((p) => p.status === "ACTIVE") ?? [];
  const plan = business?.plan ?? "STARTER";
  const limit = PLAN_LIMITS[plan] ?? 1;

  return (
    <div className="space-y-8">

      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mon établissement</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configurez les informations de votre établissement et de votre programme de fidélité.
        </p>
      </div>

      {/* Indicateur de progression */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {allDone ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Établissement complet !</p>
              <p className="text-xs text-gray-400">Toutes les sections sont configurées.</p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Progression
            </p>
            <div className="space-y-1">
              <StepProgress icon={Store}   done={step1Done} label="Informations générales" desc="Nom, type, adresse, téléphone" onClick={() => scrollToSection("section-general")} />
              <StepProgress icon={Star}    done={step2Done} label="Programmes de fidélité" desc="Tampons et récompense"         onClick={() => router.push("/dashboard/programs")} />
              <StepProgress icon={Palette} done={step3Done} label="Apparence"              desc="Logo de l'établissement"       onClick={() => scrollToSection("section-appearance")} />
            </div>
          </>
        )}
      </div>

      {/* ── Sections en grille 2 colonnes sur grands écrans ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">

      {/* ── Section 1 : Informations générales ── */}
      <Section id="section-general" title="Informations générales" icon={Store} highlighted={highlightedSection === "section-general"}>
        <form onSubmit={saveGeneralInfo} className="space-y-4">

          {/* ── Nom + recherche Google intégrée ── */}
          <div className="relative">
            <Field label="Nom de l'établissement">
              <div className="relative">
                <input
                  type="text"
                  required
                  minLength={2}
                  placeholder="Ex : Salon Élégance"
                  value={name}
                  readOnly={nameLocked}
                  onChange={nameLocked ? undefined : (e) => {
                    setName(e.target.value);
                    setGmbOpen(true);
                    handleGmbInput(e.target.value);
                  }}
                  onFocus={nameLocked ? undefined : () => { if (name.trim().length >= 2) setGmbOpen(true); }}
                  onBlur={nameLocked ? undefined : () => setTimeout(() => setGmbOpen(false), 150)}
                  className={`${inputClass} ${nameLocked ? "bg-gray-50 cursor-not-allowed pr-9" : ""}`}
                />
                {nameLocked ? (
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                ) : gmbLoading ? (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                ) : null}
              </div>
              {nameLocked ? (
                <p className="mt-1 text-xs text-gray-400 flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  Nom verrouillé — contactez le support pour le modifier.
                </p>
              ) : (
                <div className="mt-1.5 flex items-center gap-1">
                  <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="text-xs text-gray-400">Suggestions Google My Business</span>
                </div>
              )}
            </Field>

            {/* Dropdown résultats (masqué si nom verrouillé) */}
            {!nameLocked && gmbOpen && gmbResults.length > 0 && (
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

            {/* Confirmation import */}
            {!nameLocked && gmbImported && (
              <div className="flex items-center gap-2 mt-2 text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Données importées depuis Google — vérifiez et enregistrez.
                  {gmbPhotos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowPhotoModal(true)}
                      className="ml-1 underline hover:text-green-900"
                    >
                      Voir les {gmbPhotos.length} photo{gmbPhotos.length > 1 ? "s" : ""} →
                    </button>
                  )}
                </span>
              </div>
            )}
          </div>

          <Field label="Type d'établissement">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={inputClass}
            >
              {ESTABLISHMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Adresse">
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="12 rue de la Paix, Paris"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={`${inputClass} pl-8`}
              />
            </div>
          </Field>

          <Field label="Téléphone">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="tel"
                placeholder="07 72 04 72 20"
                value={phone}
                onChange={(e) => {
                  const filtered = e.target.value.replace(/[^\d\s]/g, "");
                  const digits = filtered.replace(/\s/g, "");
                  if (digits.length <= 10) setPhone(filtered);
                }}
                className={`${inputClass} pl-8`}
              />
            </div>
          </Field>

          {error1 && <ErrorBox message={error1} />}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving1 || !isDirty} className={btnPrimary}>
              {saving1 ? "Enregistrement…" : "Enregistrer"}
            </button>
            {saved1 && <span className="text-sm text-green-600 font-medium">Sauvegardé ✓</span>}
          </div>
        </form>
      </Section>

      {/* ── Section 2 : Programmes de fidélité (résumé + lien) ── */}
      <Section id="section-programs" title="Programmes de fidélité" icon={Star} highlighted={highlightedSection === "section-programs"}>
        {activePrograms.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun programme actif.</p>
        ) : (
          <div className="space-y-2">
            {activePrograms.map((p) => (
              <div key={p.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                <Stamp className="h-4 w-4 text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900">{p.name}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {p.config_json.threshold} tampons → {p.config_json.reward_label}
                  </span>
                </div>
                <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">
                  v{p.version}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {activePrograms.length}/{limit === Infinity ? "∞" : limit} programme{limit !== 1 ? "s" : ""} actif{activePrograms.length !== 1 ? "s" : ""}
          </span>
          <Link
            href="/dashboard/programs"
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            Gérer les programmes
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </Section>

      </div>{/* fin grille 2 colonnes */}

      {/* ── Section 3 : QR Code d'inscription ── */}
      {business?.slug && (
        <QrRegistrationSection
          slug={business.slug}
          businessName={business.name}
          onRegenerate={regenerateSlug}
        />
      )}

      {/* ── Section 4 : Apparence ── */}
      <Section id="section-appearance" title="Apparence" icon={Palette} highlighted={highlightedSection === "section-appearance"}>
        <LogoUploadSection
          currentLogoUrl={business?.logo_url ?? null}
          onUploaded={(url) => {
            setBusiness((b) => b ? { ...b, logo_url: url } : b);
          }}
        />
      </Section>

      {/* ── Modale sélection photo Google ── */}
      {showPhotoModal && (
        <GmbPhotoModal
          photos={gmbPhotos}
          onSelect={applyGmbPhoto}
          onClose={() => setShowPhotoModal(false)}
        />
      )}

    </div>
  );
}

// ─── Composants utilitaires ───────────────────────────────────────────────────

const inputClass =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

const btnPrimary =
  "py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Section({
  id, title, icon: Icon, children, highlighted,
}: {
  id?: string;
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  highlighted?: boolean;
}) {
  return (
    <div
      id={id}
      className={`bg-white rounded-xl overflow-hidden scroll-mt-6 border-2 transition-all duration-500 ${
        highlighted
          ? "border-blue-400 shadow-md shadow-blue-100"
          : "border-gray-200 shadow-none"
      }`}
    >
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
        <Icon className="h-4 w-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function StepProgress({
  icon: Icon, done, label, desc, onClick,
}: {
  icon: React.ElementType;
  done: boolean;
  label: string;
  desc: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left rounded-lg px-2 py-2 -mx-2 transition-colors hover:bg-gray-50 group"
    >
      {done
        ? <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
        : <Circle className="h-5 w-5 text-gray-300 shrink-0" />}
      <Icon className={`h-4 w-4 shrink-0 ${done ? "text-green-500" : "text-gray-400"}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${done ? "text-gray-900" : "text-gray-500"}`}>{label}</p>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
      {!done && (
        <span className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          Configurer →
        </span>
      )}
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
      {message}
    </div>
  );
}

// ─── Upload de logo ────────────────────────────────────────────────────────────

function LogoUploadSection({
  currentLogoUrl,
  onUploaded,
}: {
  currentLogoUrl: string | null;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview]     = useState<string | null>(currentLogoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);

  // Synchroniser si le parent change (ex: après chargement initial)
  useEffect(() => { setPreview(currentLogoUrl); }, [currentLogoUrl]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation côté client
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
    // Aperçu local immédiat
    setPreview(URL.createObjectURL(file));
    uploadFile(file);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setSuccess(false);
    setError(null);

    const token = localStorage.getItem("access_token");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_URL}/api/v1/business/logo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "Erreur lors de l'upload.");
        setPreview(currentLogoUrl); // revenir à l'ancien logo
        return;
      }

      onUploaded(data.logo_url);
      setPreview(data.logo_url);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Impossible de contacter l'API.");
      setPreview(currentLogoUrl);
    } finally {
      setUploading(false);
      // Réinitialiser l'input pour permettre de re-sélectionner le même fichier
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleRemove() {
    setPreview(null);
    onUploaded("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-6">
        {/* Aperçu du logo */}
        <div className="relative shrink-0">
          {preview ? (
            <>
              <img
                src={preview}
                alt="Logo"
                className="w-24 h-24 rounded-2xl object-cover border border-gray-200 shadow-sm"
              />
              {/* Bouton supprimer */}
              <button
                onClick={handleRemove}
                title="Supprimer le logo"
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          ) : (
            <div
              onClick={() => inputRef.current?.click()}
              className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 cursor-pointer hover:border-blue-400 hover:text-blue-500 transition-colors"
            >
              <Store className="h-7 w-7" />
              <span className="text-xs">Logo</span>
            </div>
          )}

          {/* Spinner pendant l'upload */}
          {uploading && (
            <div className="absolute inset-0 rounded-2xl bg-white/80 flex items-center justify-center">
              <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Infos + bouton */}
        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium text-gray-900">Logo de l'établissement</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Apparaît sur votre page d'inscription et sur les cartes Wallet.
            </p>
            <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, SVG, WEBP — max 2 Mo</p>
          </div>

          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 py-1.5 px-3 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <Upload className="h-4 w-4" />
            {uploading ? "Upload en cours…" : preview ? "Changer le logo" : "Choisir un fichier"}
          </button>
        </div>
      </div>

      {/* Input caché */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/svg+xml,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {error   && <ErrorBox message={error} />}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          Logo mis à jour avec succès ✓
        </p>
      )}
    </div>
  );
}

// ─── Modale sélection photo Google ───────────────────────────────────────────

function GmbPhotoModal({
  photos,
  onSelect,
  onClose,
}: {
  photos: string[];
  onSelect: (url: string) => Promise<void>;
  onClose: () => void;
}) {
  const [applying, setApplying] = useState<string | null>(null);

  async function handleSelect(url: string) {
    setApplying(url);
    await onSelect(url);
    setApplying(null);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">Photos de votre établissement</h3>
            <p className="text-xs text-gray-400">Choisissez une photo à utiliser comme visuel de votre carte fidélité</p>
          </div>
        </div>

        {/* Grille de photos */}
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((url, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelect(url)}
                disabled={applying !== null}
                className="relative aspect-square rounded-xl overflow-hidden border-2 border-gray-200 hover:border-blue-400 hover:scale-[1.02] transition-all disabled:opacity-60 group"
              >
                <img
                  src={url}
                  alt={`Photo ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                {/* Overlay au hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-semibold bg-black/50 px-2 py-1 rounded-full transition-opacity">
                    Choisir
                  </span>
                </div>
                {/* Spinner si en cours d'application */}
                {applying === url && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Pied de modale */}
        <div className="px-6 pb-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Ignorer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── QR Code d'inscription ────────────────────────────────────────────────────

function QrRegistrationSection({
  slug,
  businessName,
  onRegenerate,
}: {
  slug: string;
  businessName: string;
  onRegenerate: () => Promise<void>;
}) {
  const registrationUrl = `${APP_URL}/join/${slug}`;
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerated, setRegenerated] = useState(false);

  // Détecte si le slug semble issu du nom actuel
  function slugMatchesName(s: string, n: string) {
    const expected = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return s === expected || s.startsWith(expected + "-");
  }
  const isStale = businessName && !slugMatchesName(slug, businessName);

  async function handleRegenerate() {
    setRegenerating(true);
    await onRegenerate();
    setRegenerating(false);
    setRegenerated(true);
    setTimeout(() => setRegenerated(false), 3000);
  }

  function copyLink() {
    navigator.clipboard.writeText(registrationUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handlePrint() {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>QR Code — ${slug}</title>
      <style>
        body { font-family: sans-serif; display: flex; flex-direction: column;
               align-items: center; justify-content: center; min-height: 100vh;
               margin: 0; background: #fff; }
        h1 { font-size: 22px; margin-bottom: 8px; }
        p  { font-size: 13px; color: #666; margin-bottom: 24px; }
        img { width: 260px; height: 260px; }
        small { margin-top: 16px; font-size: 11px; color: #999; }
      </style></head><body>
        <h1>Votre carte fidélité</h1>
        <p>Scannez ce QR code pour créer votre carte</p>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(registrationUrl)}" />
        <small>${registrationUrl}</small>
      </body></html>
    `);
    win.document.close();
    win.print();
  }

  return (
    <Section title="QR Code d'inscription" icon={QrCode}>
      <div className="flex flex-col sm:flex-row items-center gap-8">

        {/* QR Code */}
        <div className="shrink-0 p-4 border-2 border-dashed border-gray-200 rounded-2xl">
          <QRCodeSVG value={registrationUrl} size={160} />
        </div>

        {/* Instructions + actions */}
        <div className="flex-1 space-y-4 text-center sm:text-left">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Affichez ce QR code sur votre comptoir
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Vos clients le scannent avec leur téléphone, remplissent leurs coordonnées
              et reçoivent leur carte fidélité directement dans leur Wallet.
            </p>
          </div>

          {/* URL copiable */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <code className="text-xs text-gray-600 flex-1 truncate">{registrationUrl}</code>
            <button
              onClick={copyLink}
              title="Copier le lien"
              className="text-gray-400 hover:text-blue-600 transition-colors shrink-0"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          {/* Alerte slug obsolète */}
          {isStale && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <div className="flex-1">
                <p className="text-xs font-medium text-amber-800">
                  Le lien ne correspond plus au nom de l'établissement.
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Attendu : <span className="font-mono">/join/{businessName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}</span>
                </p>
              </div>
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="shrink-0 py-1.5 px-3 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {regenerating ? "…" : regenerated ? "Mis à jour ✓" : "Régénérer"}
              </button>
            </div>
          )}

          {/* Confirmation si pas stale mais vient d'être régénéré */}
          {!isStale && regenerated && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              Lien mis à jour depuis le nom de l'établissement ✓
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handlePrint}
              className="py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Imprimer le QR code
            </button>
            <a
              href={registrationUrl}
              target="_blank"
              rel="noreferrer"
              className="py-2 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Voir la page client →
            </a>
          </div>
        </div>
      </div>
    </Section>
  );
}
