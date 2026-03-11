"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Gift, ShieldCheck, WalletCards } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface BusinessInfo {
  name: string;
  logo_url: string | null;
  threshold: number;
  reward_label: string;
}

interface AppleWalletHealth {
  ready: boolean;
  issues: string[];
}

export default function WelcomePage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const slug = searchParams.get("slug") ?? "";
  const isNew = searchParams.get("new") === "true";

  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleHealth, setAppleHealth] = useState<AppleWalletHealth | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`${API_URL}/api/v1/join/${slug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setBusiness(data);
      })
      .catch(() => {});
  }, [slug]);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/wallet/apple/health`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setAppleHealth(data as AppleWalletHealth);
      })
      .catch(() => {});
  }, []);

  const previewStampCount = useMemo(() => {
    if (!business) return 8;
    return Math.min(Math.max(business.threshold, 5), 10);
  }, [business]);

  async function handleGoogleWallet() {
    setGoogleLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/api/v1/wallet/google/${id}/jwt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        window.open(data.save_url, "_blank");
      }
    } catch {
      // noop
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#ecfdf5_0%,#f8fafc_38%,#ffffff_100%)] px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-md space-y-5">
        <section className="rounded-[30px] border border-white/80 bg-white/90 p-6 text-center shadow-[0_22px_60px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-inner">
            <CheckCircle2 className="h-10 w-10" />
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">
              Carte créée
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              {isNew ? "Votre carte est prête" : "Bon retour"}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {business
                ? isNew
                  ? `Ajoutez votre carte ${business.name} à votre Wallet pour l'avoir toujours avec vous.`
                  : `Votre carte ${business.name} est déjà active. Vous pouvez la rouvrir à tout moment dans votre Wallet.`
                : "Ajoutez votre carte à votre Wallet pour l'avoir toujours avec vous."}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-slate-50 px-3 py-3">
              <WalletCards className="mx-auto h-4 w-4 text-emerald-600" />
              <p className="mt-2 text-[11px] font-medium text-slate-600">Toujours dispo</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-3">
              <Gift className="mx-auto h-4 w-4 text-emerald-600" />
              <p className="mt-2 text-[11px] font-medium text-slate-600">Récompense</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-3">
              <ShieldCheck className="mx-auto h-4 w-4 text-emerald-600" />
              <p className="mt-2 text-[11px] font-medium text-slate-600">Simple et sûr</p>
            </div>
          </div>
        </section>

        {business && (
          <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              {business.logo_url ? (
                <img
                  src={business.logo_url}
                  alt={business.name}
                  className="h-14 w-14 rounded-2xl object-cover ring-1 ring-slate-200"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-lg font-semibold text-emerald-600">
                  {business.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-lg font-semibold text-slate-900">{business.name}</p>
                <p className="text-sm text-slate-500">Carte de fidélité active</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">Votre objectif fidélité</p>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                  {business.threshold} tampons
                </span>
              </div>

              <div className="mt-4 grid grid-cols-5 gap-2">
                {Array.from({ length: previewStampCount }).map((_, index) => (
                  <div
                    key={index}
                    className="flex aspect-square items-center justify-center rounded-full border border-emerald-200 bg-white text-xs font-medium text-emerald-600"
                  >
                    {index + 1}
                  </div>
                ))}
              </div>

              <p className="mt-4 text-sm text-slate-600">
                Après <strong>{business.threshold} tampons</strong> : {business.reward_label}
              </p>
            </div>
          </section>
        )}

        <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Ajoutez-la à votre Wallet</h2>
            <p className="mt-1 text-sm text-slate-500">
              Choisissez l'application la plus pratique sur votre téléphone.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                if (!appleHealth?.ready) return;
                window.location.href = `${API_URL}/api/v1/wallet/apple/${id}/download`;
              }}
              disabled={appleHealth?.ready === false}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-black px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <AppleIcon />
              {appleHealth?.ready === false ? "Apple Wallet indisponible" : "Ajouter à Apple Wallet"}
            </button>

            {appleHealth?.ready === false && (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-700">
                {appleHealth.issues[0] ?? "Configuration Apple Wallet incomplète."}
              </p>
            )}

            <button
              onClick={handleGoogleWallet}
              disabled={googleLoading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              <GoogleIcon />
              {googleLoading ? "Ouverture..." : "Ajouter à Google Wallet"}
            </button>
          </div>

          <p className="mt-4 text-xs leading-6 text-slate-400">
            Lors de chaque visite, le commerçant ajoutera vos tampons directement sur cette carte.
          </p>
        </section>
      </div>
    </div>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
