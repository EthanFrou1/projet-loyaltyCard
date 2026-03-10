"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function SetupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.body.classList.add("no-shell-pad");
    return () => document.body.classList.remove("no-shell-pad");
  }, []);

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
        body: JSON.stringify({ email: form.email, password: form.password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Erreur lors de la création du compte.");
        return;
      }

      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      router.push("/dashboard");
    } catch {
      setError("Impossible de contacter l'API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-slate-950">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(120deg, rgba(15,23,42,0.9), rgba(30,41,59,0.72)), url('https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1800&q=80')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute -top-20 right-10 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl animate-pulse" />
      <div className="absolute -bottom-16 left-10 h-80 w-80 rounded-full bg-slate-700/20 blur-3xl animate-pulse" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-6xl items-center px-4 py-0 sm:px-6 sm:py-10">
        <div className="hidden w-1/2 pr-12 lg:block">
          <div className="inline-flex rounded-2xl border border-white/70 bg-white/95 px-5 py-3 shadow-xl">
            <Image
              src="/brand/logo-horizontal.png"
              alt="FidélitéPro+"
              width={2035}
              height={518}
              className="h-8 w-auto"
              priority
            />
          </div>
          <h1 className="mt-5 text-4xl font-bold leading-tight text-white">
            Lancez votre programme de fidélité en quelques minutes.
          </h1>
          <p className="mt-4 max-w-md text-sm text-slate-200">
            Créez votre compte, configurez votre établissement et activez votre premier programme.
          </p>
        </div>

        <div className="w-full lg:w-1/2">
          <div className="mb-4 lg:hidden">
            <div className="inline-flex rounded-2xl border border-white/70 bg-white/95 px-5 py-3 shadow-xl">
              <Image
                src="/brand/logo-horizontal.png"
                alt="FidélitéPro+"
                width={2035}
                height={518}
                className="h-7 w-auto"
                priority
              />
            </div>
            <h1 className="mt-3 text-3xl font-bold leading-tight text-white">
              Lancez votre programme de fidélité en quelques minutes.
            </h1>
            <p className="mt-2 max-w-md text-sm text-slate-200">
              Créez votre compte, configurez votre établissement et activez votre premier programme.
            </p>
          </div>

          <div className="mx-auto w-full max-w-md rounded-2xl border border-white/20 bg-white/90 p-8 shadow-2xl backdrop-blur">
            <h2 className="text-2xl font-bold text-slate-900">Créer mon compte</h2>
            <p className="mt-1 text-sm text-slate-500">
              L'établissement et le programme seront configurés juste après.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Field label="Email">
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="vous@exemple.fr"
                  value={form.email}
                  onChange={handleChange}
                  className={inputClass}
                />
              </Field>

              <Field label="Mot de passe">
                <PasswordInput
                  name="password"
                  required
                  placeholder="********"
                  value={form.password}
                  onChange={handleChange}
                />
              </Field>

              <Field label="Confirmer le mot de passe">
                <PasswordInput
                  name="confirm"
                  required
                  placeholder="********"
                  value={form.confirm}
                  onChange={handleChange}
                />
              </Field>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
              >
                {loading ? "Création..." : "Créer mon compte"}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-500">
              Déjà un compte ?{" "}
              <Link href="/login" className="font-semibold text-emerald-500 hover:underline">
                Se connecter
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function PasswordInput({
  name,
  value,
  onChange,
  placeholder,
  required,
}: {
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        name={name}
        type={show ? "text" : "password"}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={`${inputClass} pr-24`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-2 my-auto h-7 rounded-md px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      >
        {show ? "Masquer" : "Afficher"}
      </button>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";
