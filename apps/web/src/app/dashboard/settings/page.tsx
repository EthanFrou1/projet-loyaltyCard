"use client";

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
      if (!res.ok) throw new Error(data.message ?? "Impossible de charger l'equipe.");
      setTeam(Array.isArray(data) ? data : []);
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "Erreur equipe.");
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
      setTeamError("Le mot de passe staff doit faire au moins 8 caracteres.");
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
      if (!res.ok) throw new Error(data.message ?? "Creation staff impossible.");

      setNewStaffEmail("");
      setNewStaffPassword("");
      await loadTeam();
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "Erreur creation staff.");
    } finally {
      setAddingStaff(false);
    }
  }

  async function removeStaff(userId: string) {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    setTeamError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/team/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Suppression impossible.");
      await loadTeam();
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "Erreur suppression.");
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();

    if (newPwd !== confirmPwd) {
      setError("Les nouveaux mots de passe ne correspondent pas.");
      return;
    }
    if (newPwd.length < 8) {
      setError("Le nouveau mot de passe doit faire au moins 8 caracteres.");
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Parametres du compte</h1>
        <p className="mt-1 text-sm text-gray-500">Gerez vos informations de connexion.</p>
      </div>

      <Section title="Informations du compte" icon={User}>
        <div className="space-y-4">
          <InfoRow label="Adresse email" value={email || "-"} />
          <InfoRow
            label="Role"
            value={
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                <ShieldCheck className="h-3 w-3" />
                {role || "-"}
              </span>
            }
          />
          <p className="text-xs text-gray-400">Pour changer votre adresse email, contactez le support.</p>
        </div>
      </Section>

      {isOwner && (
        <Section title="Equipe du salon" icon={UserPlus}>
          <div className="space-y-4">
            <form onSubmit={addStaff} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
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
              <button type="submit" disabled={addingStaff} className={btnPrimary}>
                {addingStaff ? "Creation..." : "Ajouter staff"}
              </button>
            </form>

            {teamError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                {teamError}
              </div>
            )}

            <div className="space-y-2">
              {teamLoading && <p className="text-sm text-gray-500">Chargement equipe...</p>}
              {!teamLoading && team.length === 0 && (
                <p className="text-sm text-gray-500">Aucun membre dans l'equipe.</p>
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
                      onClick={() => removeStaff(member.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

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

          <Field label="Nouveau mot de passe (min. 8 caracteres)">
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
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
              Mot de passe modifie avec succes.
            </div>
          )}

          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? "Enregistrement..." : "Changer le mot de passe"}
          </button>
        </form>
      </Section>
    </div>
  );
}

const inputClass =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

const btnPrimary =
  "py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors";

function Section({
  title, icon: Icon, children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
        <Icon className="h-4 w-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}

