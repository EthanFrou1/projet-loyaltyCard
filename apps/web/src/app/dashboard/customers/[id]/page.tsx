"use client";

/**
 * Page détail client
 *
 * Affiche :
 *   - Compteur de tampons avec visualisation graphique
 *   - Bouton "+1 Tampon" (geste principal au comptoir)
 *   - Bouton "Consommer récompense" (si disponible)
 *   - QR code du client
 *   - Informations du client (programme assigné inclus)
 *   - Carte digitale : statut Apple Wallet / Google Wallet
 *   - Historique des transactions
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { QRCodeSVG } from "qrcode.react";
import { createPortal } from "react-dom";
import { ArrowLeft, Smartphone, CheckCircle2, Circle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import type { CustomerDetailResponse } from "@loyalty/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface AppleWalletHealth {
  ready: boolean;
  issues: string[];
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: customer, mutate } = useSWR<CustomerDetailResponse>(
    `/customers/${id}`,
    (url: string) => apiClient.get(url)
  );

  const { data: business } = useSWR<{ programs: Array<{ id: string; config_json: { threshold?: number } }> }>(
    "/business",
    (url: string) => apiClient.get(url)
  );

  const programId = business?.programs?.[0]?.id ?? null;
  const stampThreshold = business?.programs?.[0]?.config_json?.threshold ?? 10;

  const [loading, setLoading] = useState<"stamp" | "redeem" | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [appleHealth, setAppleHealth] = useState<AppleWalletHealth | null>(null);
  const [qrExpanded, setQrExpanded] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/wallet/apple/health`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setAppleHealth(data as AppleWalletHealth); })
      .catch(() => {});
  }, []);

  if (!customer) {
    return (
      <div className="flex items-center gap-3 text-sm text-gray-400">
        <div className="h-4 w-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        Chargement…
      </div>
    );
  }

  const rewardAvailable = customer.stamp_count >= stampThreshold;

  // Statut wallet
  const hasApple  = customer.wallet_passes.some((p) => p.platform === "APPLE");
  const hasGoogle = customer.wallet_passes.some((p) => p.platform === "GOOGLE");

  async function handleStamp() {
    if (!programId) { setMessage({ text: "Programme introuvable", ok: false }); return; }
    setLoading("stamp");
    setMessage(null);
    try {
      const result = await apiClient.post<{ reward_unlocked: boolean }>(`/customers/${id}/stamp`, { program_id: programId });
      setMessage({ text: result.reward_unlocked ? "🎉 Récompense débloquée !" : "Tampon ajouté ✓", ok: true });
      mutate();
    } catch {
      setMessage({ text: "Erreur lors de l'ajout du tampon", ok: false });
    } finally {
      setLoading(null);
    }
  }

  async function handleRedeem() {
    if (!programId) { setMessage({ text: "Programme introuvable", ok: false }); return; }
    setLoading("redeem");
    setMessage(null);
    try {
      await apiClient.post(`/customers/${id}/redeem`, { program_id: programId });
      setMessage({ text: "Récompense consommée. Compteur remis à 0.", ok: true });
      mutate();
    } catch {
      setMessage({ text: "Pas de récompense disponible", ok: false });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">

      {/* Navigation retour */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/customers" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
          Clients
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-900">{customer.name}</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* â”€â”€ Bloc tampons (2 colonnes sur xl) â”€â”€ */}
        <div className="xl:col-span-2 bg-white rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Tampons</h2>
            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {customer.stamp_count} / {stampThreshold}
            </span>
          </div>

          {/* Visualisation tampons — cercles plus petits */}
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: stampThreshold }).map((_, i) => (
              <div
                key={i}
                className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-medium transition-colors shrink-0 ${
                  i < customer.stamp_count
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-200 text-gray-300"
                }`}
              >
                {i < customer.stamp_count ? "✓" : i + 1}
              </div>
            ))}
          </div>

          {/* Barre de progression */}
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (customer.stamp_count / stampThreshold) * 100)}%` }}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleStamp}
              disabled={loading !== null || rewardAvailable}
              className="flex-1 py-3 px-4 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading === "stamp" ? "Ajout…" : "+ 1 Tampon"}
            </button>

            {rewardAvailable && (
              <button
                onClick={handleRedeem}
                disabled={loading !== null}
                className="flex-1 py-3 px-4 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {loading === "redeem" ? "Traitement…" : "🎁 Utiliser la récompense"}
              </button>
            )}
          </div>

          {message && (
            <p className={`text-sm text-center font-medium py-2 px-3 rounded-lg ${
              message.ok ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"
            }`}>
              {message.text}
            </p>
          )}
        </div>

        {/* â”€â”€ QR Code â”€â”€ */}
        <div className="bg-white rounded-xl p-6 shadow-sm flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-gray-800">QR Code</h2>
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <button
              type="button"
              title="Agrandir le QR code"
              onClick={() => setQrExpanded(true)}
              className="border border-gray-200 rounded-xl p-2 bg-white hover:border-blue-300 transition-colors"
            >
              <QRCodeSVG value={customer.qr_url} size={160} />
            </button>
            <p className="text-xs text-center text-gray-400">
              Le client scanne ce code pour valider son passage
            </p>
          </div>
        </div>
      </div>

      {/* â”€â”€ Informations client â”€â”€ */}
      {qrExpanded && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setQrExpanded(false);
          }}
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">QR Code client</h3>
              <button
                type="button"
                onClick={() => setQrExpanded(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Fermer
              </button>
            </div>
            <div className="border border-gray-200 rounded-xl p-3 w-fit mx-auto bg-white">
              <QRCodeSVG value={customer.qr_url} size={260} />
            </div>
          </div>
        </div>,
        document.body
      )}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Informations</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <InfoItem label="Téléphone" value={customer.phone ?? "—"} />
          <InfoItem label="Email" value={customer.email ?? "—"} />
          <InfoItem label="Client depuis" value={new Date(customer.created_at).toLocaleDateString("fr-FR")} />
          <InfoItem label="Points" value={String(customer.point_count)} />
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Programme</p>
            {customer.program_name ? (
              <Link
                href="/dashboard/programs"
                className="inline-flex items-center gap-1 font-medium text-blue-700 hover:text-blue-900 text-sm"
              >
                {customer.program_name}
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : (
              <p className="font-medium text-gray-400 text-sm">Non assigné</p>
            )}
          </div>
        </div>
      </div>

      {/* â”€â”€ Carte digitale â”€â”€ */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Carte digitale</h2>
        <p className="text-xs text-gray-400 mb-4">
          Le client peut ajouter sa carte de fidélité directement dans son application Wallet.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Apple Wallet */}
          <div className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-gray-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">Apple Wallet</p>
                <p className={`text-xs flex items-center gap-1 mt-0.5 ${hasApple ? "text-green-600" : "text-gray-400"}`}>
                  {hasApple
                    ? <><CheckCircle2 className="h-3 w-3" /> Activé</>
                    : <><Circle className="h-3 w-3" /> Non activé</>
                  }
                </p>
              </div>
            </div>
                        <button
              onClick={() => {
                if (!appleHealth?.ready) return;
                window.location.href = `${API_URL}/api/v1/wallet/apple/${id}/download`;
              }}
              disabled={appleHealth?.ready === false}
              className="text-xs px-3 py-1.5 bg-black text-white rounded-lg hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity shrink-0"
            >
              {appleHealth?.ready === false
                ? "Indisponible"
                : hasApple ? "Mettre à jour" : "Ajouter"}
            </button>
          </div>

          {/* Google Wallet */}
          <div className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-gray-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">Google Wallet</p>
                <p className={`text-xs flex items-center gap-1 mt-0.5 ${hasGoogle ? "text-green-600" : "text-gray-400"}`}>
                  {hasGoogle
                    ? <><CheckCircle2 className="h-3 w-3" /> Activé</>
                    : <><Circle className="h-3 w-3" /> Non activé</>
                  }
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                const data = await apiClient.post<{ save_url: string }>(`/wallet/google/${id}/jwt`, {});
                window.open(data.save_url, "_blank");
              }}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:opacity-90 transition-opacity shrink-0"
            >
              {hasGoogle ? "Mettre à jour" : "Ajouter"}
            </button>
          </div>

        </div>
      </div>

      {/* â”€â”€ Historique â”€â”€ */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Historique des transactions</h2>
        {customer.transactions.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune transaction pour l'instant</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {customer.transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-3 text-sm">
                <span className={t.type === "STAMP_REDEEM" ? "text-green-700 font-medium" : "text-gray-700"}>
                  {t.type === "STAMP_ADD" && "Tampon ajouté"}
                  {t.type === "STAMP_REDEEM" && "🎁 Récompense utilisée"}
                  {t.note && <span className="text-gray-400"> — {t.note}</span>}
                </span>
                <span className="text-gray-400 shrink-0 ml-4">
                  {new Date(t.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// â”€â”€â”€ Composants utilitaires â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function InfoItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`font-medium ${highlight ? "text-blue-700" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

