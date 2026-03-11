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
import { createPortal } from "react-dom";
import { ArrowLeft, Smartphone, CheckCircle2, Circle, ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { StyledQRCode } from "@/components/styled-qr-code";
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
    (url: string) => apiClient.get<CustomerDetailResponse>(url)
  );

  const { data: business } = useSWR<{
    programs: Array<{ id: string; config_json: { threshold?: number } }>;
    settings_json: { establishment_type?: string } | null;
    logo_url: string | null;
  }>(
    "/business",
    (url: string) => apiClient.get<{
      programs: Array<{ id: string; config_json: { threshold?: number } }>;
      settings_json: { establishment_type?: string } | null;
      logo_url: string | null;
    }>(url)
  );

  const programId = business?.programs?.[0]?.id ?? null;
  const stampThreshold = business?.programs?.[0]?.config_json?.threshold ?? 10;
  const establishmentType = business?.settings_json?.establishment_type ?? null;
  const logoUrl = business?.logo_url ?? null;

  const [loading, setLoading] = useState<"stamp" | "redeem" | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [appleHealth, setAppleHealth] = useState<AppleWalletHealth | null>(null);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [redeemConfirmOpen, setRedeemConfirmOpen] = useState(false);
  const [walletLoading, setWalletLoading] = useState<"APPLE" | "GOOGLE" | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/wallet/apple/health`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setAppleHealth(data as AppleWalletHealth); })
      .catch(() => {});
  }, []);

  if (!customer) {
    return (
      <div className="flex items-center gap-3 text-sm text-gray-400">
        <div className="h-4 w-4 border-2 border-gray-300 border-t-slate-500 rounded-full animate-spin" />
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

  async function handleAppleWallet() {
    setWalletLoading("APPLE");
    setMessage(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/wallet/apple/${id}/download`);
      if (!response.ok) throw new Error("apple_wallet_download_failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "loyalty.pkpass";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      await mutate();
    } catch {
      setMessage({ text: "Impossible de générer la carte Apple Wallet.", ok: false });
    } finally {
      setWalletLoading(null);
    }
  }

  async function handleGoogleWallet() {
    setWalletLoading("GOOGLE");
    setMessage(null);
    try {
      const data = await apiClient.post<{ save_url: string }>(`/wallet/google/${id}/jwt`, {});
      await mutate();
      window.open(data.save_url, "_blank", "noopener,noreferrer");
    } catch {
      setMessage({ text: "Impossible de préparer la carte Google Wallet.", ok: false });
    } finally {
      setWalletLoading(null);
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

        {/* Bloc tampons (2 colonnes sur xl) */}
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
                    ? "border-emerald-500 bg-emerald-500 text-white"
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
              className="h-2 rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.min(100, (customer.stamp_count / stampThreshold) * 100)}%` }}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleStamp}
              disabled={loading !== null || rewardAvailable}
              className="flex-1 py-3 px-4 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              {loading === "stamp" ? "Ajout…" : "+ 1 Tampon"}
            </button>

            {rewardAvailable && (
              <button
                onClick={() => setRedeemConfirmOpen(true)}
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

        {/* QR Code */}
        <div className="bg-white rounded-xl p-6 shadow-sm flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-gray-800">QR Code</h2>
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <button
              type="button"
              title="Agrandir le QR code"
              onClick={() => setQrExpanded(true)}
              className="border border-gray-200 rounded-xl p-2 bg-white hover:border-slate-300 transition-colors"
            >
              <StyledQRCode value={customer.qr_url} size={160} establishmentType={establishmentType} logoUrl={logoUrl} />
            </button>
            <p className="text-xs text-center text-gray-400">
              Le client scanne ce code pour valider son passage
            </p>
          </div>
        </div>
      </div>

      {/* Informations client */}
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
              <StyledQRCode value={customer.qr_url} size={260} establishmentType={establishmentType} logoUrl={logoUrl} />
            </div>
          </div>
        </div>,
        document.body
      )}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-800">Informations</h2>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4" />
            Modifier
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem label="Téléphone" value={customer.phone ?? "—"} />
          <InfoItem label="Email" value={customer.email ?? "—"} />
          <InfoItem label="Client depuis" value={new Date(customer.created_at).toLocaleDateString("fr-FR")} />
          <InfoItem label="Passages" value={String(customer.stamp_count)} />
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Programme</p>
            {customer.program_name ? (
              <Link
                href="/dashboard/programs"
                className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:text-slate-900 text-sm"
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

      {editOpen && (
        <EditCustomerModal
          customer={customer}
          onClose={() => setEditOpen(false)}
          onUpdated={async () => {
            setEditOpen(false);
            await mutate();
          }}
        />
      )}

      {redeemConfirmOpen && (
        <ConfirmRedeemModal
          customerName={customer.name}
          loading={loading === "redeem"}
          onCancel={() => {
            if (loading !== "redeem") setRedeemConfirmOpen(false);
          }}
          onConfirm={() => void handleRedeem()}
        />
      )}

      {/* Carte digitale */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Carte digitale</h2>
        <p className="text-xs text-gray-400 mb-4">
          Le client peut ajouter sa carte de fidélité directement dans son application Wallet.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Apple Wallet */}
          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
              type="button"
              onClick={() => void handleAppleWallet()}
              disabled={walletLoading !== null}
              className="text-xs px-3 py-1.5 bg-black text-white rounded-lg hover:opacity-90 transition-opacity shrink-0"
            >
              {walletLoading === "APPLE" ? "Préparation..." : hasApple ? "Mettre à jour" : "Ajouter"}
            </button>
          </div>

          {/* Google Wallet */}
          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
              type="button"
              onClick={() => void handleGoogleWallet()}
              disabled={walletLoading !== null}
              className="text-xs px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shrink-0"
            >
              {walletLoading === "GOOGLE" ? "Préparation..." : hasGoogle ? "Mettre à jour" : "Ajouter"}
            </button>
          </div>

        </div>
      </div>

      {/* Historique */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Historique des transactions</h2>
        {customer.transactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center">
            <p className="text-sm font-medium text-gray-600">Aucune transaction pour l'instant</p>
            <p className="mt-1 text-xs text-gray-400">
              Les ajouts de tampons et les récompenses utilisées apparaîtront ici.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {customer.transactions.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${t.type === "STAMP_REDEEM" ? "text-green-700" : "text-gray-800"}`}>
                    {t.type === "STAMP_ADD" && "Tampon ajouté"}
                    {t.type === "STAMP_REDEEM" && "🎁 Récompense utilisée"}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                    {t.performed_by_name && (
                      <span className="text-xs text-gray-500">
                        Par <strong className="text-gray-700">{t.performed_by_name}</strong>
                      </span>
                    )}
                    {t.source && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        t.source === "QR_SCAN"
                          ? "bg-slate-100 text-emerald-500"
                          : t.source === "PAGE_CLIENT"
                          ? "bg-gray-100 text-gray-500"
                          : "bg-gray-100 text-gray-400"
                      }`}>
                        {t.source === "QR_SCAN" ? "Scan QR" : t.source === "PAGE_CLIENT" ? "Page client" : t.source}
                      </span>
                    )}
                    {t.note && (
                      <span className="text-xs text-gray-400 truncate max-w-[200px]">{t.note}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-400 shrink-0 mt-0.5 sm:text-right">
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

// Composants utilitaires

function EditCustomerModal({
  customer,
  onClose,
  onUpdated,
}: {
  customer: CustomerDetailResponse;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const initialName = splitCustomerName(customer.name);
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedFirstName = firstName.trim();
  const trimmedLastName = lastName.trim();
  const trimmedPhone = phone.trim();
  const trimmedEmail = email.trim();
  const isPhoneValid = /^\d{10}$/.test(trimmedPhone);
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const isFormValid = trimmedFirstName.length >= 2 && trimmedLastName.length >= 2 && isPhoneValid && isEmailValid;
  const isDirty =
    trimmedFirstName !== initialName.firstName ||
    trimmedLastName !== initialName.lastName ||
    trimmedPhone !== (customer.phone ?? "") ||
    trimmedEmail !== (customer.email ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) return;
    setLoading(true);
    setError(null);
    try {
      await apiClient.patch(`/customers/${customer.id}`, {
        name: `${trimmedFirstName} ${trimmedLastName}`.trim(),
        phone: trimmedPhone,
        email: trimmedEmail,
      });
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md space-y-5 rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Modifier le client</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            Fermer
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <CustomerField label="Prénom" required>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={customerInputClass}
              autoFocus
            />
          </CustomerField>

          <CustomerField label="Nom" required>
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={customerInputClass}
            />
          </CustomerField>

          <CustomerField label="Téléphone" required>
            <input
              type="tel"
              required
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className={customerInputClass}
            />
          </CustomerField>

          <CustomerField label="Email" required>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={customerInputClass}
            />
          </CustomerField>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !isFormValid || !isDirty}
              className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function splitCustomerName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: fullName.trim(), lastName: "" };
  }
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function InfoItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`font-medium ${highlight ? "text-emerald-700" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

function CustomerField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}


function ConfirmRedeemModal({
  customerName,
  loading,
  onCancel,
  onConfirm,
}: {
  customerName: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900">Consommer la r?compense ?</h3>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          Le compteur de <strong>{customerName}</strong> sera remis ? z?ro apr?s validation.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {loading ? "Validation..." : "Valider"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const customerInputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500";

