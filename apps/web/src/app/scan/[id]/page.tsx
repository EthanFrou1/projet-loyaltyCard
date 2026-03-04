"use client";

/**
 * Page de scan QR client — /scan/:id
 *
 * Ouverte quand le commerçant scanne le QR code d'un client.
 * - Si non connecté → redirige vers /login (avec retour préservé)
 * - Si connecté → affiche le client + boutons tampon / récompense
 *
 * Cette page est conçue pour une utilisation rapide sur mobile :
 * interface minimaliste, boutons larges, feedback immédiat.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle, XCircle, Stamp } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface ScanData {
  id: string;
  name: string;
  phone: string | null;
  stamp_count: number;
  program: { id: string; threshold: number; reward_label: string } | null;
}

export default function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData]       = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [action, setAction]   = useState<"stamp" | "redeem" | null>(null);
  const [result, setResult]   = useState<{ ok: boolean; message: string } | null>(null);

  // Charger les infos du client
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push(`/login?redirect=/scan/${id}`);
      return;
    }

    // Charger le client ET le business en parallèle
    Promise.all([
      fetch(`${API_URL}/api/v1/customers/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${API_URL}/api/v1/business`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ])
      .then(async ([customerRes, businessRes]) => {
        if (customerRes.status === 401) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          router.push(`/login?redirect=/scan/${id}`);
          return;
        }
        if (!customerRes.ok) throw new Error("Client non trouvé");

        const customer = await customerRes.json();
        const business = businessRes.ok ? await businessRes.json() : null;

        const activeProgram = business?.programs?.find(
          (p: { status: string }) => p.status === "ACTIVE"
        );

        setData({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          stamp_count: customer.stamp_count,
          program: activeProgram
            ? {
                id: activeProgram.id,
                threshold: activeProgram.config_json?.threshold ?? 10,
                reward_label: activeProgram.config_json?.reward_label ?? "Récompense",
              }
            : null,
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, router]);

  async function handleStamp() {
    if (!data?.program) return;
    setAction("stamp");
    setResult(null);

    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/v1/customers/${id}/stamp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ program_id: data.program.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Erreur");

      const newCount = data.stamp_count + 1;
      setData((d) => d ? { ...d, stamp_count: newCount } : d);
      setResult({
        ok: true,
        message: json.reward_unlocked
          ? `🎉 Récompense débloquée ! ${data.program.reward_label}`
          : `Tampon ${newCount}/${data.program.threshold} ajouté ✓`,
      });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setAction(null);
    }
  }

  async function handleRedeem() {
    if (!data?.program) return;
    setAction("redeem");
    setResult(null);

    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/v1/customers/${id}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ program_id: data.program.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Erreur");

      setData((d) => d ? { ...d, stamp_count: 0 } : d);
      setResult({ ok: true, message: "Récompense consommée. Compteur remis à 0 ✓" });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setAction(null);
    }
  }

  // ── États de chargement / erreur ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <XCircle className="h-12 w-12 text-red-400 mx-auto" />
          <p className="text-gray-600 font-medium">{error ?? "Client introuvable"}</p>
          <button
            onClick={() => router.push("/dashboard/customers")}
            className="text-sm text-blue-600 hover:underline"
          >
            Retour aux clients
          </button>
        </div>
      </div>
    );
  }

  const { program, stamp_count, name, phone } = data;
  const threshold = program?.threshold ?? 10;
  const rewardAvailable = stamp_count >= threshold;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">

        {/* En-tête client */}
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center space-y-1">
          <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-2xl font-bold mx-auto">
            {name[0].toUpperCase()}
          </div>
          <p className="text-lg font-semibold text-gray-900 mt-3">{name}</p>
          {phone && <p className="text-sm text-gray-400">{phone}</p>}
        </div>

        {/* Compteur tampons */}
        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Tampons</span>
            <span className="text-sm font-semibold text-gray-900">
              {stamp_count} / {threshold}
            </span>
          </div>

          {/* Points visuels */}
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: threshold }).map((_, i) => (
              <div
                key={i}
                className={`aspect-square rounded-full border-2 flex items-center justify-center text-xs font-semibold transition-colors ${
                  i < stamp_count
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-200 text-gray-300"
                }`}
              >
                {i < stamp_count ? "✓" : i + 1}
              </div>
            ))}
          </div>

          {/* Barre de progression */}
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (stamp_count / threshold) * 100)}%` }}
            />
          </div>

          {program && (
            <p className="text-xs text-center text-gray-400">
              {threshold} tampons = {program.reward_label}
            </p>
          )}
        </div>

        {/* Feedback résultat */}
        {result && (
          <div className={`rounded-xl p-4 flex items-center gap-3 ${
            result.ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
          }`}>
            {result.ok
              ? <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
              : <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
            <p className={`text-sm font-medium ${result.ok ? "text-green-700" : "text-red-700"}`}>
              {result.message}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleStamp}
            disabled={action !== null || rewardAvailable}
            className="w-full py-4 bg-blue-600 text-white text-base font-semibold rounded-2xl hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <Stamp className="h-5 w-5" />
            {action === "stamp" ? "Ajout…" : "+ 1 Tampon"}
          </button>

          {rewardAvailable && (
            <button
              onClick={handleRedeem}
              disabled={action !== null}
              className="w-full py-4 bg-green-600 text-white text-base font-semibold rounded-2xl hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {action === "redeem" ? "Traitement…" : "🎁 Utiliser la récompense"}
            </button>
          )}

          <button
            onClick={() => router.push(`/dashboard/customers/${id}`)}
            className="w-full py-3 border border-gray-200 text-gray-600 text-sm font-medium rounded-2xl hover:bg-gray-50 transition-colors"
          >
            Voir la fiche complète →
          </button>
        </div>

      </div>
    </div>
  );
}
