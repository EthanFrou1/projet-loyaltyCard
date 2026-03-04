"use client";

/**
 * Page de bienvenue affichée après l'inscription du client.
 * Accessible sans authentification (le client arrive ici depuis /join).
 */

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

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
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center text-4xl animate-bounce">
            Success
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isNew ? "Votre carte est prête !" : "Bienvenue de retour !"}
            </h1>
            {business && (
              <p className="text-sm text-gray-500 mt-1">
                {isNew
                  ? "Ajoutez-la à votre wallet pour l'avoir toujours avec vous."
                  : `Votre carte ${business.name} est déjà active.`}
              </p>
            )}
          </div>
        </div>

        {business && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-left space-y-3">
            <div className="flex items-center gap-3">
              {business.logo_url ? (
                <img
                  src={business.logo_url}
                  alt={business.name}
                  className="w-12 h-12 rounded-xl object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-xl">Shop</div>
              )}
              <div>
                <p className="font-semibold text-gray-900">{business.name}</p>
                <p className="text-xs text-gray-500">Carte de fidélité</p>
              </div>
            </div>

            <div>
              <div className="grid grid-cols-5 gap-2 mb-2">
                {Array.from({ length: Math.min(business.threshold, 10) }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-full border-2 border-gray-200 flex items-center justify-center text-xs text-gray-300"
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                Après <strong>{business.threshold} tampons</strong> : {business.reward_label}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              if (!appleHealth?.ready) return;
              window.location.href = `${API_URL}/api/v1/wallet/apple/${id}/download`;
            }}
            disabled={appleHealth?.ready === false}
            className="flex items-center justify-center gap-3 w-full py-3.5 px-4 bg-black text-white font-semibold rounded-xl hover:bg-gray-900 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <AppleIcon />
            {appleHealth?.ready === false ? "Apple Wallet indisponible" : "Ajouter à Apple Wallet"}
          </button>
          {appleHealth?.ready === false && (
            <p className="text-xs text-amber-600 text-left px-1">
              {appleHealth.issues[0] ?? "Configuration Apple Wallet incomplète."}
            </p>
          )}

          <button
            onClick={handleGoogleWallet}
            disabled={googleLoading}
            className="flex items-center justify-center gap-3 w-full py-3.5 px-4 bg-white text-gray-800 font-semibold rounded-xl border-2 border-gray-200 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            <GoogleIcon />
            {googleLoading ? "Ouverture..." : "Ajouter à Google Wallet"}
          </button>
        </div>

        <p className="text-xs text-gray-400 px-4">
          Votre carte s'affiche dans votre application Wallet. Le commerçant scannera votre QR code à chaque visite pour ajouter un tampon.
        </p>
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




