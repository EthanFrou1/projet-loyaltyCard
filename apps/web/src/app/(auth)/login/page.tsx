"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";

interface LoginResponse {
  access_token: string;
  refresh_token: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.body.classList.add("no-shell-pad");
    return () => document.body.classList.remove("no-shell-pad");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await apiClient.post<LoginResponse>("/auth/login", { email, password });
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      router.push("/dashboard");
    } catch {
      setError("Email ou mot de passe incorrect.");
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
            "linear-gradient(120deg, rgba(15,23,42,0.92), rgba(30,41,59,0.75)), url('https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1800&q=80')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl animate-pulse" />
      <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-slate-700/20 blur-3xl animate-pulse" />

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
            Transformez chaque visite en client fidélité.
          </h1>
          <p className="mt-4 max-w-md text-sm text-slate-200">
            Gérez vos programmes de fidélité, scans et cartes Wallet depuis une interface simple.
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
            <h1 className="mt-3 text-3xl font-bold leading-tight text-white">Transformez chaque visite en client fidélité.</h1>
            <p className="mt-2 max-w-md text-sm text-slate-200">
              Gérez vos programmes de fidélité, scans et cartes Wallet depuis une interface simple.
            </p>
          </div>
          <div className="mx-auto w-full max-w-md rounded-2xl border border-white/20 bg-white/90 p-8 shadow-2xl backdrop-blur">
            <h2 className="text-2xl font-bold text-slate-900">Connexion</h2>
            <p className="mt-1 text-sm text-slate-500">Accédez à votre espace FidélitéPro+.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Field label="Email">
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="Mot de passe">
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
              >
                {loading ? "Connexion..." : "Se connecter"}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-500">
              Pas encore de compte ?{" "}
              <Link href="/setup" className="font-semibold text-emerald-500 hover:underline">
                Créer un compte
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
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input id={id} type={show ? "text" : "password"} required value={value} onChange={onChange} className={`${inputClass} pr-24`} />
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
