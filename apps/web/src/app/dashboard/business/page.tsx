"use client";

/**
 * Page Mon établissement — configuration complète du business.
 *
 * Sections :
 *  1. Informations générales  → nom, type, adresse, téléphone
 *  2. Programme de fidélité   → seuil de tampons et description de la récompense
 *  3. Apparence               → logo (à venir)
 *
 * Appels API :
 *  GET   /api/v1/business              → charger les données actuelles
 *  PATCH /api/v1/business              → mettre à jour les infos générales
 *  PATCH /api/v1/business/programs/:id → mettre à jour le programme (versioning)
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Circle, Store, Star, Palette, MapPin, Phone, QrCode, Copy, Check, Upload, Trash2, AlertTriangle, ChevronDown, ChevronUp, Plus, Lock, Pencil } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
  name: string;
  slug: string;
  logo_url: string | null;
  plan: "STARTER" | "PRO" | "BUSINESS";
  settings_json: {
    establishment_type?: string;
    address?: string;
    phone?: string;
  } | null;
  programs: Program[];
}

const PLAN_LIMITS: Record<string, number> = { STARTER: 1, PRO: 3, BUSINESS: Infinity };

const ESTABLISHMENT_TYPES = [
  { value: "salon_coiffure", label: "Salon de coiffure" },
  { value: "barbier",        label: "Barbier" },
  { value: "institut_beaute",label: "Institut de beauté" },
  { value: "spa",            label: "Spa / Bien-être" },
  { value: "onglerie",       label: "Onglerie / Nail art" },
  { value: "restaurant",     label: "Restaurant" },
  { value: "cafe",           label: "Café / Boulangerie" },
  { value: "boutique",       label: "Boutique / Commerce" },
  { value: "autre",          label: "Autre" },
];

// ─── Composant principal ──────────────────────────────────────────────────────

export default function BusinessPage() {
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loadError, setLoadError] = useState(false);

  // ── Formulaire section 1 ──
  const [name, setName]       = useState("");
  const [type, setType]       = useState("salon_coiffure");
  const [address, setAddress] = useState("");
  const [phone, setPhone]     = useState("");
  const [saving1, setSaving1] = useState(false);
  const [saved1, setSaved1]   = useState(false);
  const [error1, setError1]   = useState<string | null>(null);

  // ── Édition d'un programme (section 2) ──
  const [editingProgram, setEditingProgram]   = useState<Program | null>(null);
  const [editName, setEditName]               = useState("");
  const [editThreshold, setEditThreshold]     = useState("10");
  const [editReward, setEditReward]           = useState("");
  const [editSaving, setEditSaving]           = useState(false);
  const [editError, setEditError]             = useState<string | null>(null);
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [showHistory, setShowHistory]         = useState(false);

  // ── Ajout d'un nouveau programme (Pro/Business) ──
  const [showAddModal, setShowAddModal]   = useState(false);
  const [newProgName, setNewProgName]     = useState("");
  const [newThreshold, setNewThreshold]  = useState("10");
  const [newReward, setNewReward]        = useState("");
  const [addingProg, setAddingProg]      = useState(false);
  const [addProgError, setAddProgError]  = useState<string | null>(null);

  // Charger les données depuis l'API
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

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
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((data: Business | null) => {
        if (!data) return;
        setBusiness(data);
        setName(data.name ?? "");
        const s = data.settings_json ?? {};
        setType(s.establishment_type ?? "salon_coiffure");
        setAddress(s.address ?? "");
        setPhone(s.phone ?? "");
      })
      .catch(() => setLoadError(true));
  }, []);

  // ── Sauvegarder les infos générales ─────────────────────────────────────────
  async function saveGeneralInfo(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError1("Le nom doit faire au moins 2 caractères.");
      return;
    }

    setSaving1(true);
    setError1(null);
    setSaved1(false);

    const token = localStorage.getItem("access_token");

    try {
      const res = await fetch(`${API_URL}/api/v1/business`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(),
          settings_json: {
            ...(business?.settings_json ?? {}),
            establishment_type: type,
            address: address.trim(),
            phone: phone.trim(),
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError1(data.message ?? "Erreur lors de la sauvegarde.");
        return;
      }

      setSaved1(true);
      setTimeout(() => setSaved1(false), 3000);
    } catch {
      setError1("Impossible de contacter l'API.");
    } finally {
      setSaving1(false);
    }
  }

  // ── Ouvrir la modale d'édition pour un programme ────────────────────────────
  function openEditModal(p: Program) {
    setEditingProgram(p);
    setEditName(p.name);
    setEditThreshold(String(p.config_json.threshold ?? 10));
    setEditReward(p.config_json.reward_label ?? "");
    setEditError(null);
    setShowEditConfirm(false);
  }

  // ── Valider les champs et passer à l'étape de confirmation ──────────────────
  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = parseInt(editThreshold, 10);
    if (editName.trim().length < 2) {
      setEditError("Le nom doit faire au moins 2 caractères.");
      return;
    }
    if (isNaN(t) || t < 1 || t > 50) {
      setEditError("Le nombre de tampons doit être entre 1 et 50.");
      return;
    }
    if (editReward.trim().length < 2) {
      setEditError("Décrivez la récompense (au moins 2 caractères).");
      return;
    }
    setEditError(null);
    setShowEditConfirm(true);
  }

  // ── Confirmer et enregistrer (versioning) ───────────────────────────────────
  async function confirmEditProgram() {
    if (!editingProgram) return;

    setEditSaving(true);
    setEditError(null);

    const token = localStorage.getItem("access_token");

    try {
      const res = await fetch(`${API_URL}/api/v1/business/programs/${editingProgram.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: editName.trim(),
          config: {
            threshold: parseInt(editThreshold, 10),
            reward_label: editReward.trim(),
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setEditError(data.message ?? "Erreur lors de la sauvegarde.");
        setShowEditConfirm(false);
        return;
      }

      const { active: newProgram } = await res.json();

      // Mettre à jour la liste : ancien programme archivé, nouveau programme actif
      setBusiness((b) => {
        if (!b) return b;
        return {
          ...b,
          programs: [
            newProgram,
            ...b.programs.map((p) =>
              p.id === editingProgram.id ? { ...p, status: "ARCHIVED" as const } : p
            ),
          ],
        };
      });

      setEditingProgram(null);
      setShowEditConfirm(false);
    } catch {
      setEditError("Impossible de contacter l'API.");
      setShowEditConfirm(false);
    } finally {
      setEditSaving(false);
    }
  }

  // ── Ajouter un nouveau programme ────────────────────────────────────────────
  async function addProgram() {
    const t = parseInt(newThreshold, 10);
    if (!newProgName.trim() || isNaN(t) || t < 1 || t > 50 || !newReward.trim()) {
      setAddProgError("Remplissez tous les champs correctement.");
      return;
    }

    setAddingProg(true);
    setAddProgError(null);
    const token = localStorage.getItem("access_token");

    try {
      const res = await fetch(`${API_URL}/api/v1/business/programs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newProgName.trim(),
          type: "STAMPS",
          config: { threshold: t, reward_label: newReward.trim() },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAddProgError(data.message ?? "Erreur lors de la création.");
        return;
      }

      setBusiness((b) => b ? { ...b, programs: [data, ...b.programs] } : b);
      setShowAddModal(false);
      setNewProgName("");
      setNewThreshold("10");
      setNewReward("");
    } catch {
      setAddProgError("Impossible de contacter l'API.");
    } finally {
      setAddingProg(false);
    }
  }

  // ── Indicateur de progression ────────────────────────────────────────────────
  const step1Done = name.trim().length >= 2 && type !== "";
  const step2Done = (business?.programs?.filter((p) => p.status === "ACTIVE").length ?? 0) > 0;
  const step3Done = !!business?.logo_url;
  const allDone   = step1Done && step2Done && step3Done;

  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightedSection(id);
    setTimeout(() => setHighlightedSection(null), 2000);
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Impossible de charger les données. Rechargez la page.</p>
      </div>
    );
  }

  const activePrograms = business?.programs?.filter((p) => p.status === "ACTIVE") ?? [];
  const archivedPrograms = business?.programs?.filter((p) => p.status === "ARCHIVED") ?? [];
  const plan = business?.plan ?? "STARTER";
  const limit = PLAN_LIMITS[plan] ?? 1;
  const isLocked = plan === "STARTER";
  const isFull = activePrograms.length >= limit;

  return (
    <div className="space-y-8">

      {/* ── Modale d'édition d'un programme — étape 1 : champs ── */}
      {editingProgram && !showEditConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900">Modifier le programme</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Version actuelle : v{editingProgram.version} — une nouvelle version sera créée.
              </p>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <Field label="Nom du programme">
                <input
                  type="text"
                  required
                  minLength={2}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
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
                    onChange={(e) => setEditThreshold(e.target.value)}
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
                  onChange={(e) => setEditReward(e.target.value)}
                  placeholder="Ex : 10€ de réduction, 1 soin offert…"
                  className={inputClass}
                />
              </Field>
              {editError && <ErrorBox message={editError} />}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingProgram(null)}
                  className="py-2 px-4 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Suivant →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modale d'édition — étape 2 : confirmation versioning ── */}
      {editingProgram && showEditConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Créer une nouvelle version ?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Cette action va créer la <strong>version {editingProgram.version + 1}</strong> de « {editingProgram.name} ».
                </p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-sm text-amber-800 space-y-1">
              <p>• Les clients déjà inscrits <strong>conservent leurs règles actuelles</strong> jusqu'à leur prochaine récompense.</p>
              <p>• Les <strong>nouveaux clients</strong> bénéficieront des nouvelles conditions.</p>
            </div>
            {editError && <ErrorBox message={editError} />}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowEditConfirm(false)}
                className="py-2 px-4 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                ← Retour
              </button>
              <button
                onClick={confirmEditProgram}
                disabled={editSaving}
                className="py-2 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {editSaving ? "Enregistrement…" : "Confirmer la modification"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale ajout programme (Pro/Business) ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Nouveau programme de fidélité</h3>
            <div className="space-y-3">
              <Field label="Nom du programme">
                <input type="text" value={newProgName} onChange={(e) => setNewProgName(e.target.value)}
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
            {addProgError && <ErrorBox message={addProgError} />}
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowAddModal(false); setAddProgError(null); }}
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

      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mon établissement</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configurez les informations de votre établissement et de votre programme de fidélité.
        </p>
      </div>

      {/* Indicateur de progression */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {allDone ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Établissement complet !</p>
              <p className="text-xs text-gray-400">Toutes les sections sont configurées.</p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Progression
            </p>
            <div className="space-y-1">
              <StepProgress icon={Store}   done={step1Done} label="Informations générales" desc="Nom, type, adresse, téléphone" onClick={() => scrollToSection("section-general")} />
              <StepProgress icon={Star}    done={step2Done} label="Programmes de fidélité" desc="Tampons et récompense"         onClick={() => scrollToSection("section-programs")} />
              <StepProgress icon={Palette} done={step3Done} label="Apparence"              desc="Logo de l'établissement"       onClick={() => scrollToSection("section-appearance")} />
            </div>
          </>
        )}
      </div>

      {/* ── Sections en grille 2 colonnes sur grands écrans ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">

      {/* ── Section 1 : Informations générales ── */}
      <Section id="section-general" title="Informations générales" icon={Store} highlighted={highlightedSection === "section-general"}>
        <form onSubmit={saveGeneralInfo} className="space-y-4">

          <Field label="Nom de l'établissement">
            <input
              type="text"
              required
              minLength={2}
              placeholder="Ex : Salon Élégance"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Type d'établissement">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={inputClass}
            >
              {ESTABLISHMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-400 flex items-center gap-1">
              <span>Bientôt :</span>
              <span className="text-blue-500">import automatique depuis Google My Business</span>
            </p>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Adresse">
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="12 rue de la Paix, Paris"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={`${inputClass} pl-8`}
                />
              </div>
            </Field>

            <Field label="Téléphone">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="tel"
                  placeholder="01 23 45 67 89"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`${inputClass} pl-8`}
                />
              </div>
            </Field>
          </div>

          {error1 && <ErrorBox message={error1} />}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving1} className={btnPrimary}>
              {saving1 ? "Enregistrement…" : "Enregistrer"}
            </button>
            {saved1 && <span className="text-sm text-green-600 font-medium">Sauvegardé ✓</span>}
          </div>
        </form>
      </Section>

      {/* ── Section 2 : Programmes de fidélité ── */}
      <Section id="section-programs" title="Programmes de fidélité" icon={Star} highlighted={highlightedSection === "section-programs"}>

        {/* Liste des programmes actifs */}
        <div className="space-y-3">

          {activePrograms.length === 0 && (
            <p className="text-sm text-gray-400 py-2">Aucun programme actif.</p>
          )}

          {activePrograms.map((p) => (
            <div key={p.id} className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">{p.name}</span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      v{p.version} — Actif
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {p.config_json.threshold} tampons → <strong className="text-gray-700">{p.config_json.reward_label}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEditModal(p)}
                  className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
                >
                  <Pencil className="h-3 w-3" />
                  Modifier
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Bouton ajouter / message limite */}
        <div className={`${activePrograms.length > 0 ? "mt-4 pt-4 border-t border-gray-100" : "mt-2"}`}>
          {isLocked ? (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span>Plusieurs programmes actifs disponibles avec le plan <strong>Pro</strong> ou <strong>Business</strong></span>
            </div>
          ) : isFull ? (
            <div className="flex items-center gap-2 text-xs text-amber-600">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span>Limite atteinte ({activePrograms.length}/{limit} programmes). Passez au plan supérieur.</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Ajouter un programme ({activePrograms.length}/{limit})
            </button>
          )}
        </div>

        {/* Historique des versions archivées */}
        {archivedPrograms.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Historique des versions ({archivedPrograms.length})
            </button>
            {showHistory && (
              <div className="mt-3 space-y-2">
                {archivedPrograms
                  .sort((a, b) => b.version - a.version)
                  .map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-gray-600 shrink-0">{p.name} — v{p.version}</span>
                        <span className="text-gray-400 shrink-0">—</span>
                        <span className="text-gray-500 truncate">
                          {p.config_json.threshold} tampons = {p.config_json.reward_label}
                        </span>
                      </div>
                      <span className="text-gray-400 shrink-0 ml-2">
                        {new Date(p.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </Section>

      </div>{/* fin grille 2 colonnes */}

      {/* ── Section 3 : QR Code d'inscription ── */}
      {business?.slug && <QrRegistrationSection slug={business.slug} />}

      {/* ── Section 4 : Apparence ── */}
      <Section id="section-appearance" title="Apparence" icon={Palette} highlighted={highlightedSection === "section-appearance"}>
        <LogoUploadSection
          currentLogoUrl={business?.logo_url ?? null}
          onUploaded={(url) => setBusiness((b) => b ? { ...b, logo_url: url } : b)}
        />
      </Section>

    </div>
  );
}

// ─── Composants utilitaires ───────────────────────────────────────────────────

const inputClass =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

const btnPrimary =
  "py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Section({
  id, title, icon: Icon, children, highlighted,
}: {
  id?: string;
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  highlighted?: boolean;
}) {
  return (
    <div
      id={id}
      className={`bg-white rounded-xl overflow-hidden scroll-mt-6 border-2 transition-all duration-500 ${
        highlighted
          ? "border-blue-400 shadow-md shadow-blue-100"
          : "border-gray-200 shadow-none"
      }`}
    >
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
        <Icon className="h-4 w-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function StepProgress({
  icon: Icon, done, label, desc, onClick,
}: {
  icon: React.ElementType;
  done: boolean;
  label: string;
  desc: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left rounded-lg px-2 py-2 -mx-2 transition-colors hover:bg-gray-50 group"
    >
      {done
        ? <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
        : <Circle className="h-5 w-5 text-gray-300 shrink-0" />}
      <Icon className={`h-4 w-4 shrink-0 ${done ? "text-green-500" : "text-gray-400"}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${done ? "text-gray-900" : "text-gray-500"}`}>{label}</p>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
      {!done && (
        <span className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          Configurer →
        </span>
      )}
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
      {message}
    </div>
  );
}

// ─── Upload de logo ────────────────────────────────────────────────────────────

function LogoUploadSection({
  currentLogoUrl,
  onUploaded,
}: {
  currentLogoUrl: string | null;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview]   = useState<string | null>(currentLogoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);

  // Synchroniser si le parent change (ex: après chargement initial)
  useEffect(() => { setPreview(currentLogoUrl); }, [currentLogoUrl]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation côté client
    const allowed = ["image/jpeg", "image/png", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Format non supporté. Utilisez JPG, PNG, SVG ou WEBP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Fichier trop volumineux (max 2 Mo).");
      return;
    }

    setError(null);
    // Aperçu local immédiat
    setPreview(URL.createObjectURL(file));
    uploadFile(file);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setSuccess(false);
    setError(null);

    const token = localStorage.getItem("access_token");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_URL}/api/v1/business/logo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "Erreur lors de l'upload.");
        setPreview(currentLogoUrl); // revenir à l'ancien logo
        return;
      }

      onUploaded(data.logo_url);
      setPreview(data.logo_url);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Impossible de contacter l'API.");
      setPreview(currentLogoUrl);
    } finally {
      setUploading(false);
      // Réinitialiser l'input pour permettre de re-sélectionner le même fichier
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleRemove() {
    setPreview(null);
    onUploaded("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-6">
        {/* Aperçu du logo */}
        <div className="relative shrink-0">
          {preview ? (
            <>
              <img
                src={preview}
                alt="Logo"
                className="w-24 h-24 rounded-2xl object-cover border border-gray-200 shadow-sm"
              />
              {/* Bouton supprimer */}
              <button
                onClick={handleRemove}
                title="Supprimer le logo"
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          ) : (
            <div
              onClick={() => inputRef.current?.click()}
              className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 cursor-pointer hover:border-blue-400 hover:text-blue-500 transition-colors"
            >
              <Store className="h-7 w-7" />
              <span className="text-xs">Logo</span>
            </div>
          )}

          {/* Spinner pendant l'upload */}
          {uploading && (
            <div className="absolute inset-0 rounded-2xl bg-white/80 flex items-center justify-center">
              <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Infos + bouton */}
        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium text-gray-900">Logo de l'établissement</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Apparaît sur votre page d'inscription et sur les cartes Wallet.
            </p>
            <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, SVG, WEBP — max 2 Mo</p>
          </div>

          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 py-1.5 px-3 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <Upload className="h-4 w-4" />
            {uploading ? "Upload en cours…" : preview ? "Changer le logo" : "Choisir un fichier"}
          </button>
        </div>
      </div>

      {/* Input caché */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/svg+xml,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {error   && <ErrorBox message={error} />}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          Logo mis à jour avec succès ✓
        </p>
      )}
    </div>
  );
}

// ─── QR Code d'inscription ────────────────────────────────────────────────────

function QrRegistrationSection({ slug }: { slug: string }) {
  const registrationUrl = `${APP_URL}/join/${slug}`;
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(registrationUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handlePrint() {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>QR Code — ${slug}</title>
      <style>
        body { font-family: sans-serif; display: flex; flex-direction: column;
               align-items: center; justify-content: center; min-height: 100vh;
               margin: 0; background: #fff; }
        h1 { font-size: 22px; margin-bottom: 8px; }
        p  { font-size: 13px; color: #666; margin-bottom: 24px; }
        img { width: 260px; height: 260px; }
        small { margin-top: 16px; font-size: 11px; color: #999; }
      </style></head><body>
        <h1>Votre carte fidélité</h1>
        <p>Scannez ce QR code pour créer votre carte</p>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(registrationUrl)}" />
        <small>${registrationUrl}</small>
      </body></html>
    `);
    win.document.close();
    win.print();
  }

  return (
    <Section title="QR Code d'inscription" icon={QrCode}>
      <div className="flex flex-col sm:flex-row items-center gap-8">

        {/* QR Code */}
        <div className="shrink-0 p-4 border-2 border-dashed border-gray-200 rounded-2xl">
          <QRCodeSVG value={registrationUrl} size={160} />
        </div>

        {/* Instructions + actions */}
        <div className="flex-1 space-y-4 text-center sm:text-left">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Affichez ce QR code sur votre comptoir
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Vos clients le scannent avec leur téléphone, remplissent leurs coordonnées
              et reçoivent leur carte fidélité directement dans leur Wallet.
            </p>
          </div>

          {/* URL copiable */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <code className="text-xs text-gray-600 flex-1 truncate">{registrationUrl}</code>
            <button
              onClick={copyLink}
              title="Copier le lien"
              className="text-gray-400 hover:text-blue-600 transition-colors shrink-0"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handlePrint}
              className="py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Imprimer le QR code
            </button>
            <a
              href={registrationUrl}
              target="_blank"
              rel="noreferrer"
              className="py-2 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Voir la page client →
            </a>
          </div>
        </div>
      </div>
    </Section>
  );
}
