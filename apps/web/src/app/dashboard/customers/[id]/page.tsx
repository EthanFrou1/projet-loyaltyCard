"use client";

/**
 * Page détail client
 *
 * Affiche :
 *   - Compteur de tampons avec visualisation graphique
 *   - Bouton "+1 Tampon" (geste principal au comptoir)
 *   - Bouton "Consommer récompense" (si disponible)
 *   - QR code du client
 *   - Historique des transactions
 *   - Liens "Ajouter au wallet" (Apple / Google)
 *
 * Le program_id actif est chargé depuis GET /business au montage.
 */

import { useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import type { CustomerDetailResponse } from "@loyalty/types";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();

  // Charger le client
  const { data: customer, mutate } = useSWR<CustomerDetailResponse>(
    `/customers/${id}`,
    (url: string) => apiClient.get(url)
  );

  // Charger le program_id actif depuis le business
  const { data: business } = useSWR<{ programs: Array<{ id: string; config_json: { threshold?: number } }> }>(
    "/business",
    (url: string) => apiClient.get(url)
  );

  const programId = business?.programs?.[0]?.id ?? null;
  const stampThreshold = business?.programs?.[0]?.config_json?.threshold ?? 10;

  const [loading, setLoading] = useState<"stamp" | "redeem" | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  if (!customer) {
    return (
      <div className="flex items-center gap-3 text-sm text-gray-400">
        <div className="h-4 w-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        Chargement…
      </div>
    );
  }

  const rewardAvailable = customer.stamp_count >= stampThreshold;

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

        {/* ── Bloc tampons (prend 2 colonnes sur xl) ── */}
        <div className="xl:col-span-2 bg-white rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Tampons</h2>
            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {customer.stamp_count} / {stampThreshold}
            </span>
          </div>

          {/* Visualisation tampons */}
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: stampThreshold }).map((_, i) => (
              <div
                key={i}
                className={`aspect-square rounded-full border-2 flex items-center justify-center text-sm font-medium transition-colors ${
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

        {/* ── QR Code ── */}
        <div className="bg-white rounded-xl p-6 shadow-sm space-y-4 flex flex-col items-center justify-center">
          <h2 className="text-lg font-semibold text-gray-800 self-start">QR Code</h2>
          <QRCodeSVG value={customer.qr_url} size={160} />
          <p className="text-xs text-center text-gray-400">
            Le client scanne ce code pour valider son passage
          </p>
        </div>
      </div>

      {/* ── Informations client ── */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Informations</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <InfoItem label="Téléphone" value={customer.phone ?? "—"} />
          <InfoItem label="Email" value={customer.email ?? "—"} />
          <InfoItem label="Client depuis" value={new Date(customer.created_at).toLocaleDateString("fr-FR")} />
          <InfoItem label="Points" value={String(customer.point_count)} />
        </div>
      </div>

      {/* ── Carte digitale ── */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Carte digitale</h2>
        <div className="flex gap-3">
          <WalletButton
            label="Apple Wallet"
            onClick={() => { window.location.href = `/api/v1/wallet/apple/${id}/download`; }}
            bg="bg-black"
          />
          <WalletButton
            label="Google Wallet"
            onClick={async () => {
              const data = await apiClient.post<{ save_url: string }>(`/wallet/google/${id}/jwt`, {});
              window.open(data.save_url, "_blank");
            }}
            bg="bg-blue-600"
          />
        </div>
      </div>

      {/* ── Historique ── */}
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

// ─── Composants utilitaires ───────────────────────────────────────────────────

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="font-medium text-gray-900">{value}</p>
    </div>
  );
}

function WalletButton({ label, onClick, bg }: { label: string; onClick: () => void; bg: string }) {
  return (
    <button
      onClick={onClick}
      className={`${bg} text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity`}
    >
      {label}
    </button>
  );
}
