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
  Star, Plus, Lock, AlertTriangle, Stamp, Store, Palette, Smartphone,
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
  config_json: {
    threshold?: number;
    reward_label?: string;
    background_color?: string;
    text_color?: "light" | "dark";
  };
}

interface Business {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
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
  const [subTab, setSubTab]           = useState<"apercu" | "carte" | "parametres" | "historique">("apercu");

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

  // ── Design carte ──
  const [editBgColor, setEditBgColor]     = useState("#1a1a2e");
  const [editTextColor, setEditTextColor] = useState<"light" | "dark">("light");
  const [designDirty, setDesignDirty]     = useState(false);
  const [designSaving, setDesignSaving]   = useState(false);
  const [designSaved, setDesignSaved]     = useState(false);
  const [designError, setDesignError]     = useState<string | null>(null);

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
    setEditBgColor(p.config_json.background_color ?? "#1a1a2e");
    setEditTextColor(p.config_json.text_color ?? "light");
    setEditStep("form");
    setEditDirty(false);
    setDesignDirty(false);
    setEditError(null);
    setDesignError(null);
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
          config: {
            threshold: parseInt(editThreshold, 10),
            reward_label: editReward.trim(),
            background_color: editBgColor,
            text_color: editTextColor,
          },
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

  // ── Sauvegarder le design sans versioning ────────────────────────────────────
  async function saveDesign() {
    if (!selectedId) return;
    setDesignSaving(true);
    setDesignError(null);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/v1/business/programs/${selectedId}/design`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ background_color: editBgColor, text_color: editTextColor }),
      });
      if (!res.ok) {
        const d = await res.json();
        setDesignError(d.message ?? "Erreur lors de la sauvegarde.");
        return;
      }
      const updated = await res.json();
      setBusiness((b) => {
        if (!b) return b;
        return {
          ...b,
          programs: b.programs.map((p) =>
            p.id === selectedId ? { ...p, config_json: updated.config_json } : p
          ),
        };
      });
      setDesignDirty(false);
      setDesignSaved(true);
      setTimeout(() => setDesignSaved(false), 3000);
    } catch {
      setDesignError("Impossible de contacter l'API.");
    } finally {
      setDesignSaving(false);
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

      {/* ── En-tête ── */}
      <div className="py-1 pb-4 flex items-start justify-between gap-4">
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
            {(["apercu", "carte", "parametres", "historique"] as const).map((tab) => {
              const config = {
                apercu:     { label: "Aperçu",      icon: BarChart2  },
                carte:      { label: "Carte Wallet", icon: Smartphone },
                parametres: { label: "Paramètres",  icon: Settings   },
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

            {/* ── Carte Wallet ── */}
            {subTab === "carte" && (
              <div className="space-y-6">
                {/* Preview */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                    Aperçu de votre carte fidélité
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Apple Wallet */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-gray-800" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                        </svg>
                        <span className="text-xs font-medium text-gray-600">Apple Wallet</span>
                      </div>
                      <AppleCard
                        businessName={business?.name ?? "Votre établissement"}
                        logoUrl={business?.logo_url ?? null}
                        programName={selectedProgram.name}
                        threshold={selectedProgram.config_json.threshold ?? 10}
                        rewardLabel={selectedProgram.config_json.reward_label ?? "Récompense"}
                        bgColor={editBgColor}
                        textColor={editTextColor}
                      />
                    </div>
                    {/* Google Wallet */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        <span className="text-xs font-medium text-gray-600">Google Wallet</span>
                      </div>
                      <GoogleCard
                        businessName={business?.name ?? "Votre établissement"}
                        logoUrl={business?.logo_url ?? null}
                        programName={selectedProgram.name}
                        threshold={selectedProgram.config_json.threshold ?? 10}
                        rewardLabel={selectedProgram.config_json.reward_label ?? "Récompense"}
                        bgColor={editBgColor}
                        textColor={editTextColor}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-3">
                    Aperçu simulé — le QR code réel est généré à l'activation de la carte.
                  </p>
                </div>

                {/* Personnalisation */}
                <div className="border-t border-gray-100 pt-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-gray-500" />
                    <p className="text-sm font-semibold text-gray-700">Personnalisation</p>
                  </div>

                  {/* Couleur de fond */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Couleur de fond</label>
                    <div className="flex flex-wrap gap-2 items-center">
                      {COLOR_PRESETS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => { setEditBgColor(color); setDesignDirty(true); }}
                          title={color}
                          className="w-8 h-8 rounded-lg transition-all hover:scale-110 focus:outline-none"
                          style={{
                            background: color,
                            boxShadow: editBgColor === color ? `0 0 0 2px white, 0 0 0 4px ${color}` : "none",
                            transform: editBgColor === color ? "scale(1.15)" : undefined,
                          }}
                        />
                      ))}
                      {/* Color picker personnalisé */}
                      <label className="relative cursor-pointer">
                        <div
                          className="w-8 h-8 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-blue-400 transition-colors text-xs"
                          style={!COLOR_PRESETS.includes(editBgColor) ? { background: editBgColor, boxShadow: `0 0 0 2px white, 0 0 0 4px ${editBgColor}` } : {}}
                        >
                          {COLOR_PRESETS.includes(editBgColor) ? "+" : ""}
                        </div>
                        <input
                          type="color"
                          value={editBgColor}
                          onChange={(e) => { setEditBgColor(e.target.value); setDesignDirty(true); }}
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        />
                      </label>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">Couleur actuelle : <code className="bg-gray-100 px-1 rounded">{editBgColor}</code></p>
                  </div>

                  {/* Couleur du texte */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Couleur du texte</label>
                    <div className="flex gap-3">
                      {(["light", "dark"] as const).map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => { setEditTextColor(val); setDesignDirty(true); }}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm transition-colors ${
                            editTextColor === val
                              ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                              : "border-gray-200 text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          <div
                            className="w-4 h-4 rounded-full border border-gray-300"
                            style={{ background: val === "light" ? "#ffffff" : "#111827" }}
                          />
                          {val === "light" ? "Texte clair" : "Texte foncé"}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">
                      Choisissez "Texte clair" pour les fonds sombres, "Texte foncé" pour les fonds clairs.
                    </p>
                  </div>

                  {/* Bouton save */}
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={saveDesign}
                      disabled={!designDirty || designSaving}
                      className="py-2 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {designSaving ? "Enregistrement…" : "Enregistrer le design"}
                    </button>
                    {designSaved && <span className="text-sm text-green-600 font-medium">Sauvegardé ✓</span>}
                    {designError && <span className="text-sm text-red-600">{designError}</span>}
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

// ─── Constantes palette ───────────────────────────────────────────────────────

const COLOR_PRESETS = [
  "#1a1a2e", "#0f3460", "#1b4332", "#2d1b33",
  "#7b2d00", "#1c1c1c", "#0a2342", "#3d0a0a",
];

// ─── Types préview ────────────────────────────────────────────────────────────

interface CardPreviewProps {
  businessName: string;
  logoUrl: string | null;
  programName: string;
  threshold: number;
  rewardLabel: string;
  bgColor: string;
  textColor: "light" | "dark";
}

// ─── Apple Wallet mockup ──────────────────────────────────────────────────────

function AppleCard({ businessName, logoUrl, programName, threshold, rewardLabel, bgColor, textColor }: CardPreviewProps) {
  const tc  = textColor === "light" ? "#ffffff" : "#111827";
  const dim = textColor === "light" ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.4)";
  const filled = Math.min(Math.ceil(threshold * 0.55), threshold);
  const dots   = Math.min(threshold, 10);

  return (
    <div
      className="w-full max-w-[260px] mx-auto rounded-[22px] overflow-hidden shadow-xl select-none"
      style={{ backgroundColor: bgColor }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        {logoUrl
          ? <img src={logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
          : <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.18)" }}>
              <Store className="h-4 w-4" style={{ color: tc }} />
            </div>
        }
        <span className="flex-1 min-w-0 text-[13px] font-semibold truncate" style={{ color: tc }}>
          {businessName}
        </span>
        <svg viewBox="0 0 20 14" className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.55 }}>
          <rect width="20" height="14" rx="2.5" fill={tc} />
          <rect y="4" width="20" height="3.5" fill={bgColor} />
          <circle cx="15" cy="10" r="2.5" fill={bgColor} opacity="0.6" />
        </svg>
      </div>

      <div className="mx-4 mb-3" style={{ height: 1, background: "rgba(255,255,255,0.12)" }} />

      <div className="px-4 pb-3">
        <p className="text-[9px] uppercase tracking-[0.12em] mb-0.5" style={{ color: dim }}>Programme</p>
        <p className="text-[13px] font-bold mb-3.5" style={{ color: tc }}>{programName}</p>

        <p className="text-[9px] uppercase tracking-[0.12em] mb-2" style={{ color: dim }}>Tampons</p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {Array.from({ length: dots }).map((_, i) => (
            <div
              key={i}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={i < filled
                ? { background: tc, color: bgColor }
                : { background: "rgba(255,255,255,0.10)", border: `1px solid rgba(255,255,255,0.22)`, color: dim }
              }
            >
              {i < filled ? "✓" : ""}
            </div>
          ))}
          {threshold > 10 && (
            <span className="text-[9px] self-center ml-1" style={{ color: dim }}>+{threshold - 10}</span>
          )}
        </div>
        <p className="text-[10px]" style={{ color: dim }}>
          {filled} / {threshold} — <span style={{ color: tc }}>{rewardLabel}</span>
        </p>
      </div>

      <div className="mx-3 mb-3 bg-white rounded-xl p-3 flex flex-col items-center gap-1">
        <QrSvg size={56} />
        <p className="text-[8px] text-gray-400 tracking-wide">QR Code</p>
      </div>
    </div>
  );
}

// ─── Google Wallet mockup ─────────────────────────────────────────────────────

function GoogleCard({ businessName, logoUrl, programName, threshold, rewardLabel, bgColor, textColor }: CardPreviewProps) {
  const tc     = textColor === "light" ? "#ffffff" : "#111827";
  const filled = Math.min(Math.ceil(threshold * 0.55), threshold);

  return (
    <div className="w-full max-w-[260px] mx-auto rounded-[16px] overflow-hidden shadow-xl select-none bg-white border border-gray-100">
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ backgroundColor: bgColor }}>
        {logoUrl
          ? <img src={logoUrl} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
          : <div className="w-9 h-9 rounded-xl shrink-0" style={{ background: "rgba(255,255,255,0.18)" }} />
        }
        <div className="min-w-0">
          <p className="text-[12px] font-semibold truncate" style={{ color: tc }}>{businessName}</p>
          <p className="text-[10px] truncate" style={{ color: tc, opacity: 0.7 }}>{programName}</p>
        </div>
      </div>

      <div className="px-4 py-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.1em] text-gray-400">Tampons</span>
          <span className="text-[13px] font-bold text-gray-900">{filled} / {threshold}</span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${(filled / threshold) * 100}%`, backgroundColor: bgColor }}
          />
        </div>
        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[10px] uppercase tracking-[0.1em] text-gray-400">Récompense</span>
          <span className="text-[11px] font-medium text-gray-700 max-w-[130px] text-right truncate">{rewardLabel}</span>
        </div>
      </div>

      <div className="border-t border-gray-100 py-3 px-4 flex flex-col items-center gap-1">
        <BarcodeSvg />
        <p className="text-[8px] text-gray-400 tracking-wide">Scanner à chaque visite</p>
      </div>
    </div>
  );
}

// ─── SVG helpers ──────────────────────────────────────────────────────────────

function QrSvg({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="3" height="3" rx="0.4" fill="#111" />
      <rect x="0.5" y="0.5" width="2" height="2" rx="0.2" fill="white" />
      <rect x="1" y="1" width="1" height="1" fill="#111" />
      <rect x="7" y="0" width="3" height="3" rx="0.4" fill="#111" />
      <rect x="7.5" y="0.5" width="2" height="2" rx="0.2" fill="white" />
      <rect x="8" y="1" width="1" height="1" fill="#111" />
      <rect x="0" y="7" width="3" height="3" rx="0.4" fill="#111" />
      <rect x="0.5" y="7.5" width="2" height="2" rx="0.2" fill="white" />
      <rect x="1" y="8" width="1" height="1" fill="#111" />
      <rect x="4" y="0" width="1" height="1" fill="#111" />
      <rect x="6" y="0" width="1" height="1" fill="#111" />
      <rect x="4" y="2" width="2" height="1" fill="#111" />
      <rect x="3" y="3" width="1" height="2" fill="#111" />
      <rect x="5" y="4" width="2" height="1" fill="#111" />
      <rect x="7" y="4" width="1" height="2" fill="#111" />
      <rect x="9" y="4" width="1" height="3" fill="#111" />
      <rect x="4" y="6" width="1" height="1" fill="#111" />
      <rect x="3" y="7" width="1" height="1" fill="#111" />
      <rect x="5" y="8" width="2" height="1" fill="#111" />
      <rect x="4" y="9" width="3" height="1" fill="#111" />
    </svg>
  );
}

function BarcodeSvg() {
  const bars = [2, 1, 1, 2, 1, 3, 1, 1, 2, 1, 1, 1, 3, 2, 1, 1, 2, 1, 2, 3, 1, 1, 2];
  return (
    <div className="flex gap-[1.5px] items-stretch h-10">
      {bars.map((w, i) => (
        <div
          key={i}
          className="rounded-[1px]"
          style={{ width: w * 1.5, background: i % 2 === 0 ? "#1a1a2e" : "transparent" }}
        />
      ))}
    </div>
  );
}
