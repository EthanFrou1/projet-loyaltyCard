"use client";

/**
 * Page Programmes de fidélité — /dashboard/programs
 *
 * Sélecteur d'onglet par programme actif + 3 sous-onglets :
 *   - Aperçu   : stats (clients inscrits, tampons, récompenses)
 *   - Paramètres : édition inline avec confirmation versioning
 *   - Historique : versions archivées de ce programme
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  Star, Plus, Lock, AlertTriangle, Stamp,
  Users, BarChart2, Settings, Clock, CheckCircle,
  Gift, ChevronDown, ChevronUp,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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
  slug: string;
  plan: "STARTER" | "PRO" | "BUSINESS";
  programs: Program[];
}

interface ProgramStats {
  clients: number;
  stamps: number;
  rewards: number;
  loading: boolean;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PLAN_LIMITS: Record<string, number> = { STARTER: 1, PRO: 3, BUSINESS: Infinity };

const PLAN_STYLES: Record<string, { label: string; className: string }> = {
  STARTER:  { label: "Starter",  className: "bg-gray-100 text-gray-600" },
  PRO:      { label: "Pro",      className: "bg-blue-100 text-blue-700" },
  BUSINESS: { label: "Business", className: "bg-violet-100 text-violet-700" },
};

// ─── Composants utilitaires ───────────────────────────────────────────────────

const inputClass =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
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

function StatCard({
  label, value, loading, icon: Icon, colorClass,
}: {
  label: string;
  value?: number | string;
  loading: boolean;
  icon: React.ElementType;
  colorClass: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className={`w-9 h-9 rounded-xl ${colorClass} flex items-center justify-center mb-4`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-1">
        {loading
          ? <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
          : (value ?? "—")}
      </div>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function ProgramsPage() {
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading]   = useState(true);

  // ── Sélection de programme + sous-onglets ──
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [subTab, setSubTab]           = useState<"apercu" | "parametres" | "historique">("apercu");

  // ── Stats par programme ──
  const [statsMap, setStatsMap] = useState<Record<string, ProgramStats>>({});

  // ── Édition inline ──
  const [editName, setEditName]           = useState("");
  const [editThreshold, setEditThreshold] = useState("10");
  const [editReward, setEditReward]       = useState("");
  const [editStep, setEditStep]           = useState<"form" | "confirm">("form");
  const [editDirty, setEditDirty]         = useState(false);
  const [editSaving, setEditSaving]       = useState(false);
  const [editError, setEditError]         = useState<string | null>(null);

  // ── Création ──
  const [showAddModal, setShowAddModal]  = useState(false);
  const [newName, setNewName]            = useState("");
  const [newThreshold, setNewThreshold]  = useState("10");
  const [newReward, setNewReward]        = useState("");
  const [addingProg, setAddingProg]      = useState(false);
  const [addError, setAddError]          = useState<string | null>(null);

  // ── Section programmes archivés ──
  const [showArchived, setShowArchived] = useState(false);

  // ── Chargement données ───────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { router.push("/login"); return; }

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
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data: Business | null) => {
        if (!data) return;
        setBusiness(data);
        const first = data.programs.find((p) => p.status === "ACTIVE");
        if (first) {
          setSelectedId(first.id);
          initEditFields(first);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Charger les stats du programme sélectionné ──────────────────────────────
  useEffect(() => {
    if (!selectedId || subTab !== "apercu") return;
    if (statsMap[selectedId]) return;

    setStatsMap((prev) => ({
      ...prev,
      [selectedId]: { clients: 0, stamps: 0, rewards: 0, loading: true },
    }));

    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/v1/business/programs/${selectedId}/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setStatsMap((prev) => ({
          ...prev,
          [selectedId]: {
            clients: data?.clients ?? 0,
            stamps:  data?.stamps  ?? 0,
            rewards: data?.rewards ?? 0,
            loading: false,
          },
        }));
      })
      .catch(() => {
        setStatsMap((prev) => ({
          ...prev,
          [selectedId]: { clients: 0, stamps: 0, rewards: 0, loading: false },
        }));
      });
  }, [selectedId, subTab]);

  // ── Charger les stats des programmes archivés quand la section est ouverte ──
  useEffect(() => {
    if (!showArchived || !business) return;
    const archived = business.programs.filter((p) => p.status === "ARCHIVED");
    const toFetch  = archived.filter((p) => !statsMap[p.id]);
    if (toFetch.length === 0) return;

    const token = localStorage.getItem("access_token");
    toFetch.forEach((p) => {
      setStatsMap((prev) => ({
        ...prev,
        [p.id]: { clients: 0, stamps: 0, rewards: 0, loading: true },
      }));
      fetch(`${API_URL}/api/v1/business/programs/${p.id}/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          setStatsMap((prev) => ({
            ...prev,
            [p.id]: {
              clients: data?.clients ?? 0,
              stamps:  data?.stamps  ?? 0,
              rewards: data?.rewards ?? 0,
              loading: false,
            },
          }));
        })
        .catch(() => {
          setStatsMap((prev) => ({
            ...prev,
            [p.id]: { clients: 0, stamps: 0, rewards: 0, loading: false },
          }));
        });
    });
  }, [showArchived, business]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function initEditFields(p: Program) {
    setEditName(p.name);
    setEditThreshold(String(p.config_json.threshold ?? 10));
    setEditReward(p.config_json.reward_label ?? "");
    setEditStep("form");
    setEditDirty(false);
    setEditError(null);
  }

  function selectProgram(id: string) {
    setSelectedId(id);
    setSubTab("apercu");
    const p = business?.programs.find((p) => p.id === id);
    if (p) initEditFields(p);
  }

  // ── Édition (versioning) ─────────────────────────────────────────────────────
  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = parseInt(editThreshold, 10);
    if (editName.trim().length < 2)         { setEditError("Le nom doit faire au moins 2 caractères."); return; }
    if (isNaN(t) || t < 1 || t > 50)        { setEditError("Le nombre de tampons doit être entre 1 et 50."); return; }
    if (editReward.trim().length < 2)        { setEditError("Décrivez la récompense (au moins 2 caractères)."); return; }
    setEditError(null);
    setEditStep("confirm");
  }

  async function confirmEdit() {
    if (!selectedId) return;
    setEditSaving(true);
    setEditError(null);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/v1/business/programs/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: editName.trim(),
          config: { threshold: parseInt(editThreshold, 10), reward_label: editReward.trim() },
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setEditError(d.message ?? "Erreur lors de la sauvegarde.");
        setEditStep("form");
        return;
      }
      const { active: newProg } = await res.json();
      setBusiness((b) => {
        if (!b) return b;
        return {
          ...b,
          programs: [
            newProg,
            ...b.programs.map((p) =>
              p.id === selectedId ? { ...p, status: "ARCHIVED" as const } : p
            ),
          ],
        };
      });
      // Invalider les stats du nouveau programme + le sélectionner
      setStatsMap((prev) => { const next = { ...prev }; delete next[newProg.id]; return next; });
      setSelectedId(newProg.id);
      initEditFields(newProg);
      setSubTab("apercu");
    } catch {
      setEditError("Impossible de contacter l'API.");
      setEditStep("form");
    } finally {
      setEditSaving(false);
    }
  }

  // ── Création d'un programme ──────────────────────────────────────────────────
  async function addProgram() {
    const t = parseInt(newThreshold, 10);
    if (!newName.trim() || isNaN(t) || t < 1 || t > 50 || !newReward.trim()) {
      setAddError("Remplissez tous les champs correctement.");
      return;
    }
    setAddingProg(true);
    setAddError(null);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/v1/business/programs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName.trim(), type: "STAMPS", config: { threshold: t, reward_label: newReward.trim() } }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.message ?? "Erreur lors de la création."); return; }
      setBusiness((b) => b ? { ...b, programs: [data, ...b.programs] } : b);
      setShowAddModal(false);
      setNewName(""); setNewThreshold("10"); setNewReward("");
      selectProgram(data.id);
    } catch {
      setAddError("Impossible de contacter l'API.");
    } finally {
      setAddingProg(false);
    }
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const activePrograms   = business?.programs?.filter((p) => p.status === "ACTIVE")   ?? [];
  const archivedPrograms = business?.programs?.filter((p) => p.status === "ARCHIVED") ?? [];
  const plan   = business?.plan ?? "STARTER";
  const limit  = PLAN_LIMITS[plan] ?? 1;
  const isFull = activePrograms.length >= limit;
  const selectedProgram = activePrograms.find((p) => p.id === selectedId) ?? activePrograms[0] ?? null;

  // Historique des versions archivées du programme sélectionné (même nom)
  const programHistory = selectedProgram
    ? archivedPrograms
        .filter((p) => p.name === selectedProgram.name)
        .sort((a, b) => b.version - a.version)
    : [];

  const currentStats = selectedProgram ? statsMap[selectedProgram.id] : undefined;
  const programJoinUrl = selectedProgram && business?.slug
    ? `${APP_URL}/join/${business.slug}?programId=${encodeURIComponent(selectedProgram.id)}`
    : "";

  return (
    <div className="flex flex-col gap-6">

      {/* ── Modale création ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Nouveau programme de fidélité</h3>
            <div className="space-y-3">
              <Field label="Nom du programme">
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex : Carte coiffure, Carte couleur…" className={inputClass} />
              </Field>
              <Field label="Nombre de tampons">
                <div className="flex items-center gap-3">
                  <input type="number" min={1} max={50} value={newThreshold}
                    onChange={(e) => setNewThreshold(e.target.value)} className={`${inputClass} w-24`} />
                  <span className="text-sm text-gray-500">tampons</span>
                </div>
              </Field>
              <Field label="Récompense">
                <input type="text" value={newReward} onChange={(e) => setNewReward(e.target.value)}
                  placeholder="Ex : Coupe offerte, 15€ de réduction…" className={inputClass} />
              </Field>
            </div>
            {addError && <ErrorBox message={addError} />}
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowAddModal(false); setAddError(null); }}
                className="py-2 px-4 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Annuler
              </button>
              <button onClick={addProgram} disabled={addingProg}
                className="py-2 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {addingProg ? "Création…" : "Créer le programme"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── En-tête (sticky) ── */}
      <div className="sticky top-0 z-10 bg-gray-100 -mx-8 px-8 -mt-8 pt-8 pb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programmes de fidélité</h1>
          <p className="mt-1 text-sm text-gray-500">Gérez vos programmes de tampons et de récompenses.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {business?.plan && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${PLAN_STYLES[plan]?.className}`}>
              {PLAN_STYLES[plan]?.label} · {activePrograms.length}/{limit === Infinity ? "∞" : limit}
            </span>
          )}
          {isFull ? (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
              <Lock className="h-3.5 w-3.5" />
              Limite atteinte
            </div>
          ) : (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nouveau programme
            </button>
          )}
        </div>
      </div>

      {/* ── Empty state ── */}
      {activePrograms.length === 0 && (
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-16 text-center">
          <Star className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">Aucun programme actif</p>
          <p className="text-xs text-gray-400 mt-1">Créez votre premier programme de fidélité.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 inline-flex items-center gap-2 py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Créer un programme
          </button>
        </div>
      )}

      {/* ── Interface principale ── */}
      {activePrograms.length > 0 && selectedProgram && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

          {/* ── Onglets programmes (uniquement si > 1 programme actif) ── */}
          {activePrograms.length > 1 && (
            <div className="flex border-b border-gray-200 px-4 pt-3 gap-0.5">
              {activePrograms.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectProgram(p.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap -mb-px ${
                    p.id === selectedProgram.id
                      ? "border-blue-600 text-blue-700 bg-blue-50"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  {p.name}
                  <span className="text-xs opacity-60">v{p.version}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Résumé programme sélectionné ── */}
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Stamp className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-gray-900 text-lg">{selectedProgram.name}</h2>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    v{selectedProgram.version} — Actif
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {selectedProgram.config_json.threshold ?? 10} tampons →{" "}
                  <strong className="text-gray-700">{selectedProgram.config_json.reward_label ?? "Récompense"}</strong>
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-400 shrink-0">
              Créé le {new Date(selectedProgram.created_at).toLocaleDateString("fr-FR")}
            </p>
          </div>

          {/* ── Sous-onglets ── */}
          <div className="flex border-b border-gray-100 px-6">
            {(["apercu", "parametres", "historique"] as const).map((tab) => {
              const config = {
                apercu:     { label: "Aperçu",      icon: BarChart2 },
                parametres: { label: "Paramètres",  icon: Settings  },
                historique: {
                  label: `Historique${programHistory.length > 0 ? ` (${programHistory.length})` : ""}`,
                  icon: Clock,
                },
              };
              const { label, icon: Icon } = config[tab];
              return (
                <button
                  key={tab}
                  onClick={() => setSubTab(tab)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    subTab === tab
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* ── Contenu des sous-onglets ── */}
          <div className="p-6">

            {/* ── Aperçu ── */}
            {subTab === "apercu" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                  <StatCard
                    label="Clients inscrits"
                    value={currentStats?.clients}
                    loading={currentStats?.loading ?? true}
                    icon={Users}
                    colorClass="bg-blue-50 text-blue-600"
                  />
                  <StatCard
                    label="Tampons distribués"
                    value={currentStats?.stamps}
                    loading={currentStats?.loading ?? true}
                    icon={Stamp}
                    colorClass="bg-violet-50 text-violet-600"
                  />
                  <StatCard
                    label="Récompenses utilisées"
                    value={currentStats?.rewards}
                    loading={currentStats?.loading ?? true}
                    icon={Gift}
                    colorClass="bg-amber-50 text-amber-600"
                  />
                  <StatCard
                    label="Taux de conversion"
                    value={
                      currentStats && !currentStats.loading && currentStats.clients > 0
                        ? `${Math.round((currentStats.rewards / currentStats.clients) * 100)} %`
                        : currentStats?.loading
                          ? undefined
                          : "—"
                    }
                    loading={currentStats?.loading ?? true}
                    icon={CheckCircle}
                    colorClass="bg-green-50 text-green-600"
                  />
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                    QR code du programme
                  </p>
                  <div className="grid md:grid-cols-[180px_1fr] gap-5 items-center">
                    <div className="w-[170px] h-[170px] border border-gray-200 rounded-xl p-2 bg-white flex items-center justify-center">
                      <QRCodeSVG value={programJoinUrl || APP_URL} size={150} />
                    </div>
                    <div className="space-y-3">
                      <p className="text-sm text-gray-600">
                        Ce QR inscrit le client directement au programme <strong>{selectedProgram.name}</strong>.
                      </p>
                      <a
                        href={programJoinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-sm text-blue-600 hover:underline break-all"
                      >
                        {programJoinUrl}
                      </a>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!programJoinUrl) return;
                          await navigator.clipboard.writeText(programJoinUrl);
                        }}
                        className="py-2 px-4 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Copier le lien
                      </button>
                    </div>
                  </div>
                </div>

                {/* Règle visuelle */}
                <div className="bg-gray-50 rounded-xl p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                    Règle de fidélité
                  </p>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2.5 bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm">
                      <Stamp className="h-4 w-4 text-blue-500" />
                      <span className="font-bold text-gray-900 text-lg">
                        {selectedProgram.config_json.threshold ?? 10}
                      </span>
                      <span className="text-sm text-gray-500">tampons</span>
                    </div>
                    <span className="text-gray-300 text-2xl font-light">→</span>
                    <div className="flex items-center gap-2.5 bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm">
                      <Star className="h-4 w-4 text-amber-500" />
                      <span className="font-semibold text-gray-900">
                        {selectedProgram.config_json.reward_label ?? "Récompense"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Paramètres (édition inline) ── */}
            {subTab === "parametres" && (
              <div className="max-w-lg">
                {editStep === "form" ? (
                  <form onSubmit={handleEditSubmit} className="space-y-4">
                    <Field label="Nom du programme">
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={editName}
                        onChange={(e) => { setEditName(e.target.value); setEditDirty(true); }}
                        placeholder="Ex : Carte fidélité, Carte coiffure…"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Nombre de tampons pour une récompense">
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min={1}
                          max={50}
                          required
                          value={editThreshold}
                          onChange={(e) => { setEditThreshold(e.target.value); setEditDirty(true); }}
                          className={`${inputClass} w-24`}
                        />
                        <span className="text-sm text-gray-500">tampons</span>
                      </div>
                    </Field>
                    <Field label="Description de la récompense">
                      <input
                        type="text"
                        required
                        value={editReward}
                        onChange={(e) => { setEditReward(e.target.value); setEditDirty(true); }}
                        placeholder="Ex : 10€ de réduction, 1 soin offert…"
                        className={inputClass}
                      />
                    </Field>
                    {editError && <ErrorBox message={editError} />}
                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={!editDirty}
                        className="py-2 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        Suivant →
                      </button>
                      {!editDirty && (
                        <span className="text-xs text-gray-400">Modifiez un champ pour activer</span>
                      )}
                    </div>
                  </form>
                ) : (
                  /* Étape 2 : confirmation versioning */
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-900">Créer une nouvelle version ?</p>
                        <p className="text-sm text-amber-700 mt-0.5">
                          La <strong>version {selectedProgram.version}</strong> sera archivée et la{" "}
                          <strong>version {selectedProgram.version + 1}</strong> sera créée.
                        </p>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 space-y-1">
                      <p>• Les clients déjà inscrits <strong>conservent leurs règles actuelles</strong> jusqu'à leur prochaine récompense.</p>
                      <p>• Les <strong>nouveaux clients</strong> bénéficieront des nouvelles conditions.</p>
                    </div>
                    {/* Résumé des nouvelles valeurs */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-1">Nom</p>
                        <p className="font-medium text-gray-900">{editName}</p>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-1">Tampons</p>
                        <p className="font-medium text-gray-900">{editThreshold}</p>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg p-3 col-span-2">
                        <p className="text-xs text-gray-400 mb-1">Récompense</p>
                        <p className="font-medium text-gray-900">{editReward}</p>
                      </div>
                    </div>
                    {editError && <ErrorBox message={editError} />}
                    <div className="flex gap-3">
                      <button
                        onClick={() => setEditStep("form")}
                        className="py-2 px-4 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        ← Retour
                      </button>
                      <button
                        onClick={confirmEdit}
                        disabled={editSaving}
                        className="py-2 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {editSaving ? "Enregistrement…" : "Confirmer la modification"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Historique ── */}
            {subTab === "historique" && (
              <div>
                {programHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Aucune version archivée pour ce programme.</p>
                    <p className="text-xs text-gray-400 mt-1">
                      L&apos;historique apparaîtra après la première modification du programme.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                      Versions précédentes — {selectedProgram.name}
                    </p>
                    {programHistory.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-5 py-4">
                        <div className="flex items-center gap-4">
                          <span className="text-xs font-semibold bg-gray-200 text-gray-600 px-2.5 py-1 rounded-full">
                            v{p.version}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-gray-700">{p.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {p.config_json.threshold} tampons → {p.config_json.reward_label}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-400">Archivé le</p>
                          <p className="text-xs font-medium text-gray-600 mt-0.5">
                            {new Date(p.created_at).toLocaleDateString("fr-FR")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Programmes archivés avec clients actifs ── */}
      {archivedPrograms.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {showArchived
                ? <ChevronUp className="h-4 w-4 text-gray-400" />
                : <ChevronDown className="h-4 w-4 text-gray-400" />}
              <span className="text-sm font-medium text-gray-700">
                Programmes archivés
              </span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {archivedPrograms.length}
              </span>
            </div>
            <span className="text-xs text-gray-400">
              Les clients inscrits sur ces versions conservent leurs règles d&apos;origine
            </span>
          </button>

          {showArchived && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {archivedPrograms
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map((p) => {
                  const s = statsMap[p.id];
                  return (
                    <div key={p.id} className="flex items-center gap-4 px-5 py-4">
                      {/* Icône */}
                      <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                        <Stamp className="h-4 w-4 text-gray-400" />
                      </div>
                      {/* Infos */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-700">{p.name}</span>
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                            v{p.version} — Archivé
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {p.config_json.threshold} tampons → {p.config_json.reward_label}
                        </p>
                      </div>
                      {/* Stats clients restants */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Users className="h-3.5 w-3.5 text-gray-400" />
                        {s?.loading ? (
                          <div className="h-4 w-8 bg-gray-200 rounded animate-pulse" />
                        ) : (
                          <span className={`text-sm font-semibold ${(s?.clients ?? 0) > 0 ? "text-amber-600" : "text-gray-400"}`}>
                            {s?.clients ?? 0}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">client{(s?.clients ?? 0) !== 1 ? "s" : ""}</span>
                      </div>
                      {/* Date */}
                      <div className="text-right shrink-0 hidden sm:block">
                        <p className="text-xs text-gray-400">
                          {new Date(p.created_at).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ── Info plan Starter ── */}
      {plan === "STARTER" && activePrograms.length > 0 && (
        <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
          <Lock className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-700">Plan Starter — 1 programme actif</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Passez au plan <strong>Pro</strong> (3 programmes) ou <strong>Business</strong> (illimité)
              pour créer plusieurs programmes simultanés.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
