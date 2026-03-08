"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { CheckCircle, Mail, RefreshCcw, Stamp, XCircle } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type CustomerHit = {
  id: string;
  name: string;
  email: string | null;
};

type SelectedCustomer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  stamp_count: number;
  program_id: string | null;
  program_threshold: number | null;
};

type ActiveProgram = {
  id: string;
  threshold: number;
  reward_label: string;
};

function extractCustomerId(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const direct = value.match(/^[a-z0-9]{20,}$/i);
  if (direct) return direct[0];

  const pathMatch = value.match(/\/scan\/([a-z0-9]+)/i);
  if (pathMatch?.[1]) return pathMatch[1];

  try {
    const parsed = new URL(value);
    const urlMatch = parsed.pathname.match(/^\/scan\/([a-z0-9]+)$/i);
    if (urlMatch?.[1]) return urlMatch[1];
  } catch {
    return null;
  }

  return null;
}

export default function DashboardScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedRaw, setScannedRaw] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailResults, setEmailResults] = useState<CustomerHit[]>([]);

  const [activeProgram, setActiveProgram] = useState<ActiveProgram | null>(null);
  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [action, setAction] = useState<"stamp" | "redeem" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraReady(false);
  }, []);

  const loadCustomer = useCallback(async (customerId: string) => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login?redirect=/dashboard/scan");
      return;
    }

    setCustomerLoading(true);
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/api/v1/customers/${customerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Client introuvable.");
      const data = await res.json() as SelectedCustomer;
      setCustomer(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur chargement client.";
      setEmailError(message);
      setCustomer(null);
    } finally {
      setCustomerLoading(false);
    }
  }, [router]);

  const onQrDetected = useCallback((raw: string) => {
    setScannedRaw(raw);
    const customerId = extractCustomerId(raw);
    if (!customerId) return;
    stopScanner();
    loadCustomer(customerId);
  }, [loadCustomer, stopScanner]);

  const startScanner = useCallback(async () => {
    stopScanner();
    setScannedRaw("");
    setCameraError(null);

    const video = videoRef.current;
    if (!video) return;

    try {
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(undefined, video, (decoded) => {
        const value = decoded?.getText()?.trim();
        if (!value) return;
        onQrDetected(value);
      });
      controlsRef.current = controls;
      setCameraReady(true);
    } catch {
      setCameraError("Impossible d'acceder a la camera. Verifiez les permissions du navigateur.");
      stopScanner();
    }
  }, [onQrDetected, stopScanner]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login?redirect=/dashboard/scan");
      return;
    }

    fetch(`${API_URL}/api/v1/business`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((biz) => {
        const p = (biz?.programs ?? []).find((x: { status?: string }) => x.status === "ACTIVE");
        if (!p) return;
        setActiveProgram({
          id: p.id,
          threshold: p.config_json?.threshold ?? 10,
          reward_label: p.config_json?.reward_label ?? "Recompense",
        });
      })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px), (pointer: coarse)");
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      stopScanner();
      return;
    }
    startScanner();
    return () => stopScanner();
  }, [isMobile, startScanner, stopScanner]);

  async function findByEmail() {
    const candidate = email.trim().toLowerCase();
    if (!candidate || !candidate.includes("@")) {
      setEmailError("Entrez un email valide.");
      setEmailResults([]);
      return;
    }

    setEmailLoading(true);
    setEmailError(null);
    setEmailResults([]);
    setResult(null);

    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login?redirect=/dashboard/scan");
      return;
    }

    try {
      const res = await fetch(
        `${API_URL}/api/v1/customers?search=${encodeURIComponent(candidate)}&page=1&per_page=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Recherche impossible.");

      const json = await res.json() as { data?: Array<CustomerHit> };
      const exact = (json.data ?? []).filter((c) => (c.email ?? "").toLowerCase() === candidate);

      if (exact.length === 0) {
        setEmailError("Aucun client trouve avec cet email.");
        setCustomer(null);
        return;
      }

      const first = exact[0];
      if (exact.length === 1 && first) {
        await loadCustomer(first.id);
        return;
      }

      setEmailResults(exact);
      setEmailError("Plusieurs clients avec cet email. Choisissez le bon profil.");
      setCustomer(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur de recherche.";
      setEmailError(message);
      setCustomer(null);
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleStamp() {
    if (!customer) return;
    const programId = customer.program_id ?? activeProgram?.id;
    if (!programId) {
      setResult({ ok: false, message: "Aucun programme actif configuré." });
      return;
    }

    setAction("stamp");
    setResult(null);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/v1/customers/${customer.id}/stamp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ program_id: programId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Erreur.");

      const nextCount = json.customer?.stamp_count ?? customer.stamp_count + 1;
      setCustomer((prev) => (prev ? { ...prev, stamp_count: nextCount } : prev));
      setResult({
        ok: true,
        message: json.reward_unlocked
          ? "Recompense debloquee."
          : `Tampon ajoute (${nextCount}).`,
      });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Erreur." });
    } finally {
      setAction(null);
    }
  }

  async function handleRedeem() {
    if (!customer) return;
    const programId = customer.program_id ?? activeProgram?.id;
    if (!programId) {
      setResult({ ok: false, message: "Aucun programme actif configuré." });
      return;
    }

    setAction("redeem");
    setResult(null);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/v1/customers/${customer.id}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ program_id: programId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Erreur.");

      const nextCount = json.customer?.stamp_count ?? 0;
      setCustomer((prev) => (prev ? { ...prev, stamp_count: nextCount } : prev));
      setResult({ ok: true, message: "Recompense consommee. Compteur remis a 0." });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Erreur." });
    } finally {
      setAction(null);
    }
  }

  const threshold = customer?.program_threshold ?? activeProgram?.threshold ?? 10;
  const rewardAvailable = (customer?.stamp_count ?? 0) >= threshold;

  return (
    <div className="w-full py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Scanner un client</h1>
        <p className="text-sm text-gray-500 mt-1">
          Recherchez le client par email puis ajoutez le tampon directement ici.
        </p>
      </div>

      {isMobile ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 space-y-4">
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-[4/3] object-cover" />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center text-white/90 text-sm bg-black/55 px-4 text-center">
                Initialisation camera...
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setScannedRaw("");
              setEmailError(null);
              setEmailResults([]);
              setResult(null);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Reinitialiser
          </button>

          {cameraError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {cameraError}
            </div>
          )}

          {scannedRaw && !extractCustomerId(scannedRaw) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              QR detecte mais format non reconnu: <span className="font-mono">{scannedRaw}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-6 text-sm text-gray-600">
          Sur ordinateur, la camera est desactivee. Utilisez la recherche par email client.
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 space-y-3">
        <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Saisie manuelle par email client
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@email.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={findByEmail}
            disabled={emailLoading}
            className="inline-flex items-center justify-center rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {emailLoading ? "Recherche..." : "Rechercher"}
          </button>
        </div>

        {emailError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {emailError}
          </div>
        )}

        {emailResults.length > 1 && (
          <div className="space-y-2">
            {emailResults.map((hit) => (
              <button
                key={hit.id}
                onClick={() => loadCustomer(hit.id)}
                className="w-full text-left rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50"
              >
                <p className="text-sm font-semibold text-gray-900">{hit.name}</p>
                <p className="text-xs text-gray-500">{hit.email ?? "Sans email"}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {(customerLoading || customer) && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 space-y-4">
          {customerLoading && <p className="text-sm text-gray-500">Chargement fiche client...</p>}

          {customer && (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xl font-semibold text-gray-900">{customer.name}</p>
                  <p className="text-sm text-gray-500">{customer.email ?? customer.phone ?? "Sans contact"}</p>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-900">
                  {customer.stamp_count} / {threshold}
                </span>
              </div>

              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {Array.from({ length: threshold }).map((_, i) => (
                  <div
                    key={i}
                    className={`aspect-square rounded-full border-2 flex items-center justify-center text-xs font-semibold ${
                      i < customer.stamp_count
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "border-gray-200 text-gray-300"
                    }`}
                  >
                    {i < customer.stamp_count ? "✓" : i + 1}
                  </div>
                ))}
              </div>

              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (customer.stamp_count / threshold) * 100)}%` }}
                />
              </div>

              <p className="text-xs text-gray-500">
                {threshold} tampons = {activeProgram?.reward_label ?? "Recompense"}
              </p>

              {result && (
                <div className={`rounded-xl p-3 flex items-center gap-2 ${
                  result.ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                }`}>
                  {result.ok ? (
                    <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                  <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-700"}`}>{result.message}</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleStamp}
                  disabled={action !== null || rewardAvailable}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  <Stamp className="h-4 w-4" />
                  {action === "stamp" ? "Ajout..." : "+ 1 Tampon"}
                </button>

                {rewardAvailable && (
                  <button
                    onClick={handleRedeem}
                    disabled={action !== null}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {action === "redeem" ? "Traitement..." : "Utiliser la recompense"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
