"use client";

/**
 * Page de setup — créer son compte (email + mot de passe uniquement).
 * Le business est créé automatiquement avec un nom par défaut.
 * La configuration du salon se fait ensuite dans /onboarding.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function SetupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/v1/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // business_name vide → l'API crée "Mon établissement" par défaut
        body: JSON.stringify({ email: form.email, password: form.password, business_name: "Mon établissement" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "Erreur lors de la création du compte");
        return;
      }

      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      // Signal pour afficher la modale d'onboarding au 1er accès au dashboard
      localStorage.setItem("show_onboarding", "1");

      router.push("/dashboard");
    } catch {
      setError("Impossible de contacter l'API (localhost:3001)");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-8 bg-white rounded-xl shadow space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Créer mon compte</h1>
          <p className="mt-1 text-sm text-gray-500">
            Vous configurerez votre salon à l'étape suivante.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email" name="email" type="email" placeholder="vous@exemple.fr" value={form.email} onChange={handleChange} />
          <Field label="Mot de passe (min. 8 caractères)" name="password" type="password" placeholder="••••••••" value={form.password} onChange={handleChange} />
          <Field label="Confirmer le mot de passe" name="confirm" type="password" placeholder="••••••••" value={form.confirm} onChange={handleChange} />

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {loading ? "Création…" : "Créer mon compte →"}
          </button>
        </form>

        <p className="text-xs text-center text-gray-400">
          Déjà un compte ?{" "}
          <a href="/login" className="text-blue-600 hover:underline">Se connecter</a>
        </p>
      </div>
    </div>
  );
}

function Field({ label, name, type, placeholder, value, onChange }: {
  label: string; name: string; type: string;
  placeholder: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input id={name} name={name} type={type} required placeholder={placeholder} value={value} onChange={onChange}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );
}
