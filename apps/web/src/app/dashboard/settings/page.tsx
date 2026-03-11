"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Lock, ShieldCheck, Trash2, User, UserPlus } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type TeamMember = {
  id: string;
  email: string;
  role: "OWNER" | "STAFF";
  created_at: string;
};

export default function AccountSettingsPage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const isOwner = role === "OWNER" || role === "ADMIN";

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<TeamMember | null>(null);
  const [removingStaffId, setRemovingStaffId] = useState<string | null>(null);

  const isStaffEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newStaffEmail.trim());
  const canAddStaff = isStaffEmailValid && newStaffPassword.length >= 8;
  const canChangePassword =
    currentPwd.trim().length > 0 &&
    newPwd.length >= 8 &&
    confirmPwd.length >= 8 &&
    newPwd === confirmPwd;

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    fetch(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setEmail(data.email ?? "");
        setRole(data.role ?? "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    void loadTeam();
  }, [isOwner]);

  async function loadTeam() {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    setTeamLoading(true);
    setTeamError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/team`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.message ?? "Impossible de charger l'équipe.");
      setTeam(Array.isArray(data) ? data : []);
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "Erreur équipe.");
    } finally {
      setTeamLoading(false);
    }
  }

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!newStaffEmail.includes("@")) {
      setTeamError("Email staff invalide.");
      return;
    }
    if (newStaffPassword.length < 8) {
      setTeamError("Le mot de passe staff doit faire au moins 8 caractères.");
      return;
    }
    const token = localStorage.getItem("access_token");
    if (!token) return;

    setAddingStaff(true);
    setTeamError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/team`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: newStaffEmail.trim().toLowerCase(),
          password: newStaffPassword,
          role: "STAFF",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Création staff impossible.");

      setNewStaffEmail("");
      setNewStaffPassword("");
      await loadTeam();
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "Erreur création staff.");
    } finally {
      setAddingStaff(false);
    }
  }

  async function removeStaff(userId: string) {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    setRemovingStaffId(userId);
    setTeamError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/team/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Suppression impossible.");
      setStaffToDelete(null);
      await loadTeam();
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "Erreur suppression.");
    } finally {
      setRemovingStaffId(null);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();

    if (newPwd !== confirmPwd) {
      setError("Les nouveaux mots de passe ne correspondent pas.");
      return;
    }
    if (newPwd.length < 8) {
      setError("Le nouveau mot de passe doit faire au moins 8 caractères.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    const token = localStorage.getItem("access_token");

    try {
      const res = await fetch(`${API_URL}/api/v1/auth/me/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPwd,
          new_password: newPwd,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "Erreur lors du changement de mot de passe.");
        return;
      }

      setSuccess(true);
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError("Impossible de contacter l'API.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres du compte</h1>
        <p className="mt-1 text-sm text-gray-500">Gérez vos informations de connexion.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="Informations du compte" icon={User}>
          <div className="space-y-4">
            <InfoRow label="Adresse email" value={email || "-"} />
            <InfoRow
              label="Rôle"
              value={
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  <ShieldCheck className="h-3 w-3" />
                  {role || "-"}
                </span>
              }
            />
            <p className="text-xs text-gray-400">Pour changer votre adresse email, contactez le support.</p>
          </div>
        </Section>

        <Section title="Changer le mot de passe" icon={Lock}>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <Field label="Mot de passe actuel">
              <input
                type="password"
                required
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Nouveau mot de passe (min. 8 caractères)">
              <input
                type="password"
                required
                minLength={8}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Confirmer le nouveau mot de passe">
              <input
                type="password"
                required
                minLength={8}
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                className={inputClass}
              />
            </Field>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                Mot de passe mis à jour avec succès.
              </div>
            )}

            <button type="submit" disabled={saving || !canChangePassword} className={btnPrimary}>
              {saving ? "Enregistrement..." : "Changer le mot de passe"}
            </button>
          </form>
        </Section>
      </div>

      {isOwner && (
        <Section title="Équipe du salon" icon={UserPlus}>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">Équipe existante</p>
                {!teamLoading && team.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {team.length} compte{team.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {teamLoading && <p className="text-sm text-gray-500">Chargement de l'équipe...</p>}
              {!teamLoading && team.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center">
                  <p className="text-sm font-medium text-gray-700">Aucun membre dans l'équipe</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Ajoutez un premier compte staff pour donner accès au comptoir sans partager votre compte principal.
                  </p>
                </div>
              )}

              {team.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{member.email}</p>
                    <p className="text-xs text-gray-500">{member.role}</p>
                  </div>
                  {member.role === "STAFF" && (
                    <button
                      type="button"
                      onClick={() => setStaffToDelete(member)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Ajouter un membre</p>
                <p className="mt-1 text-xs text-gray-500">
                  Créez un accès staff distinct pour le comptoir et l'équipe.
                </p>
              </div>

              <form onSubmit={addStaff} className="space-y-3">
                <input
                  type="email"
                  placeholder="coiffeur@email.com"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  className={inputClass}
                  required
                />
                <input
                  type="password"
                  minLength={8}
                  placeholder="Mot de passe initial (min 8)"
                  value={newStaffPassword}
                  onChange={(e) => setNewStaffPassword(e.target.value)}
                  className={inputClass}
                  required
                />
                <button type="submit" disabled={addingStaff || !canAddStaff} className={`${btnPrimary} w-full justify-center`}>
                  {addingStaff ? "Création..." : "Ajouter staff"}
                </button>
              </form>

              {teamError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {teamError}
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      {staffToDelete && (
        <ConfirmDangerModal
          title="Supprimer ce compte staff ?"
          description={`Le compte ${staffToDelete.email} ne pourra plus accéder au comptoir ni au dashboard.`}
          confirmLabel={removingStaffId === staffToDelete.id ? "Suppression..." : "Supprimer le compte"}
          loading={removingStaffId === staffToDelete.id}
          onCancel={() => {
            if (!removingStaffId) setStaffToDelete(null);
          }}
          onConfirm={() => void removeStaff(staffToDelete.id)}
        />
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500";

const btnPrimary =
  "rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50";

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4">
        <Icon className="h-4 w-4 text-emerald-500" />
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-50 py-2 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}

function ConfirmDangerModal({
  title,
  description,
  confirmLabel,
  loading,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
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
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-red-50 p-2 text-red-600">
            <Trash2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
