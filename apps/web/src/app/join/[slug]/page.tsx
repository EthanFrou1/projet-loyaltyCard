"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Gift, ShieldCheck, Sparkles, StoreIcon, SearchX } from "lucide-react";

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
  const [setupBlocked, setSetupBlocked] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneValid = phoneDigits.length === 10;
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
    return (business.programs ?? []).filter((program) => program.id === selectedProgramId);
  }, [business, hasPresetProgram, selectedProgramId]);

  useEffect(() => {
    const joinUrl = presetProgramId
      ? `${API_URL}/api/v1/join/${slug}?program_id=${encodeURIComponent(presetProgramId)}`
      : `${API_URL}/api/v1/join/${slug}`;

    fetch(joinUrl)
      .then(async (res) => {
        if (res.ok) return res.json() as Promise<BusinessInfo>;
        const json = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
        if (json?.code === "BUSINESS_SETUP_REQUIRED") {
          setSetupBlocked(json.message ?? "Ce programme n'est pas encore disponible.");
          return null;
        }
        throw new Error(String(res.status));
      })
      .then((data: BusinessInfo | null) => {
        if (!data) return;
        setBusiness(data);
        const ids = new Set((data.programs ?? []).map((program) => program.id));
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
    return business.programs.find((program) => program.id === selectedProgramId) ?? null;
  }, [business, selectedProgramId]);

  const brandColor = selectedProgram?.background_color ?? "#10b981";
  const isDarkText = selectedProgram?.text_color === "dark";
  const textOnBrand = isDarkText ? "#0f172a" : "#ffffff";

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
          phone: phoneDigits,
          ...(selectedProgramId && { program_id: selectedProgramId }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data?.code === "BUSINESS_SETUP_REQUIRED") {
          setError("Le commerçant doit d'abord finaliser son premier programme de fidélité.");
          return;
        }
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <SearchX className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-xl font-bold text-slate-900">Établissement introuvable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Ce lien n'est pas valide. Demandez à votre commerçant de vous montrer son QR code.
          </p>
        </div>
      </div>
    );
  }

  if (setupBlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-sm rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80 text-amber-600">
            <Sparkles className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-xl font-bold text-amber-900">Programme bientôt disponible</h1>
          <p className="mt-2 text-sm leading-6 text-amber-800">{setupBlocked}</p>
          <p className="mt-3 text-xs text-amber-700">Revenez dans quelques minutes ou contactez l'établissement.</p>
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eefbf4_100%)] px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-md space-y-5">
        <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="text-center">
            {business.logo_url ? (
              <img
                src={business.logo_url}
                alt={business.name}
                className="mx-auto h-20 w-20 rounded-3xl object-cover shadow-sm ring-1 ring-slate-200"
              />
            ) : (
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                <StoreIcon className="h-9 w-9" />
              </div>
            )}

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">Carte fidélité</p>
              <h1 className="mt-2 text-2xl font-bold text-slate-900">{business.name}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Créez votre carte gratuite en moins d'une minute et retrouvez-la facilement sur votre téléphone.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-slate-50 px-3 py-3">
              <Gift className="mx-auto h-4 w-4 text-emerald-600" />
              <p className="mt-2 text-[11px] font-medium text-slate-600">Carte gratuite</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-3">
              <Sparkles className="mx-auto h-4 w-4 text-emerald-600" />
              <p className="mt-2 text-[11px] font-medium text-slate-600">1 minute</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-3">
              <ShieldCheck className="mx-auto h-4 w-4 text-emerald-600" />
              <p className="mt-2 text-[11px] font-medium text-slate-600">Données protégées</p>
            </div>
          </div>

          <div
            className="mt-5 rounded-2xl border px-4 py-3 text-sm"
            style={{
              backgroundColor: `${brandColor}14`,
              borderColor: `${brandColor}33`,
              color: brandColor,
            }}
          >
            <p className="font-semibold">{selectedProgram?.name ?? "Programme actif"}</p>
            <p className="mt-1">
              {selectedProgram?.threshold ?? business.threshold} tampons ={" "}
              {selectedProgram?.reward_label ?? business.reward_label}
            </p>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Vos informations</h2>
            <p className="mt-1 text-sm text-slate-500">Complétez ce formulaire pour activer votre carte.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!hasPresetProgram && (business.programs?.length ?? 0) > 1 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Programme de fidélité *</label>
                <select
                  value={selectedProgramId ?? ""}
                  onChange={(e) => setSelectedProgramId(e.target.value || null)}
                  className={inputClass}
                  required
                >
                  {visiblePrograms.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name} - {program.threshold} tampons = {program.reward_label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Prénom *</label>
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
                <label className="mb-1 block text-xs font-medium text-slate-700">Nom *</label>
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
              <label className="mb-1 block text-xs font-medium text-slate-700">Email *</label>
              <input
                type="email"
                required
                placeholder="marie@exemple.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                autoComplete="email"
              />
              <p className="mt-1 text-xs text-slate-400">
                Pratique pour récupérer votre carte en cas de changement de téléphone.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Téléphone *</label>
              <input
                type="tel"
                required
                placeholder="0612345678"
                value={phone}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                  setPhone(digits);
                }}
                className={`${inputClass} ${phone && !phoneValid ? "border-red-300 focus:border-red-400 focus:ring-red-200" : ""}`}
                autoComplete="tel"
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
              />
              {phone && !phoneValid && (
                <p className="mt-1 text-xs text-red-500">Numéro invalide : 10 chiffres requis.</p>
              )}
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs leading-relaxed text-slate-500">
                J'accepte que mes données (nom, email, téléphone) soient conservées par{" "}
                <strong>{business.name}</strong> pour gérer ma carte fidélité. Elles ne seront pas partagées à des tiers.
              </span>
            </label>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!isFormValid || loading}
              className="w-full rounded-2xl px-4 py-3 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: brandColor, color: textOnBrand }}
            >
              {loading ? "Création de votre carte..." : "Créer ma carte gratuite"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100";
