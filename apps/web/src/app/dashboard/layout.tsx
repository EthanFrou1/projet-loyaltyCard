"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Users,
  LayoutDashboard,
  Sparkles,
  Settings,
  LogOut,
  Store,
  CreditCard,
  Stamp,
  X,
  Plus,
  UserPlus,
  QrCode,
  Upload,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const ESTABLISHMENT_TYPES = [
  { value: "salon_coiffure",  label: "Salon de coiffure" },
  { value: "barbier",         label: "Barbier" },
  { value: "institut_beaute", label: "Institut de beauté" },
  { value: "spa",             label: "Spa / Bien-être" },
  { value: "onglerie",        label: "Onglerie / Nail art" },
  { value: "restaurant",      label: "Restaurant" },
  { value: "cafe",            label: "Café / Boulangerie" },
  { value: "boutique",        label: "Boutique / Commerce" },
  { value: "autre",           label: "Autre" },
];

const SETUP_COLORS = [
  "#1a1a2e", "#1e3a5f", "#1a3a2a", "#2d1b4e",
  "#8b4513", "#2a2a2a", "#1e3a4f", "#4a1515",
];

const navItems = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/customers", label: "Clients", icon: Users, exact: false },
  { href: "/dashboard/programs", label: "Programmes", icon: Stamp, exact: false },
  { href: "/dashboard/ai", label: "Outils IA", icon: Sparkles, exact: false },
  { href: "/dashboard/business", label: "Mon établissement", icon: Store, exact: false },
  { href: "/dashboard/billing", label: "Abonnement", icon: CreditCard, exact: false },
  { href: "/dashboard/settings", label: "Paramètres", icon: Settings, exact: false },
];

interface UserProfile {
  email: string;
  role: string;
  business: { name: string; plan: string };
}

const planStyles: Record<string, { label: string; className: string }> = {
  STARTER: { label: "Starter", className: "bg-gray-100 text-gray-600" },
  PRO: { label: "Pro", className: "bg-blue-100 text-blue-700" },
  BUSINESS: { label: "Business", className: "bg-violet-100 text-violet-700" },
};

const fallbackPlanStyle = { label: "Starter", className: "bg-gray-100 text-gray-600" };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const onboardingChecked = useRef(false);

  useEffect(() => {
    if (onboardingChecked.current) return;
    onboardingChecked.current = true;
    if (localStorage.getItem("show_onboarding") === "1") {
      localStorage.removeItem("show_onboarding");
      setShowOnboarding(true);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
      return;
    }

    fetch(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setUser(data);
      })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    setQuickActionsOpen(false);
  }, [pathname]);

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    router.push("/login");
  }

  function goToQrFocus() {
    setQuickActionsOpen(false);
    router.push(`/dashboard?focus=qr&tick=${Date.now()}`);
  }

  const primaryMobileNav = navItems.slice(0, 5);
  const currentPlanStyle = user?.business?.plan
    ? (planStyles[user.business.plan] ?? fallbackPlanStyle)
    : fallbackPlanStyle;

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="hidden lg:flex w-64 bg-white shadow-sm flex-col">
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold text-gray-900">LoyaltyCard</h1>
          {user?.business?.name && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{user.business.name}</p>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {user?.business?.plan && (
          <div className="px-4 pb-2">
            <Link
              href="/dashboard/billing"
              className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-80 ${currentPlanStyle.className}`}
            >
              <CreditCard className="h-3 w-3 shrink-0" />
              Plan {currentPlanStyle.label}
            </Link>
          </div>
        )}

        <div className="p-4 border-t">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">
                {user.email.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">{user.email}</p>
                <p className="text-xs text-gray-400 capitalize">{user.role.toLowerCase()}</p>
              </div>
              <button
                onClick={handleLogout}
                title="Se déconnecter"
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-1">
                <div className="h-2.5 bg-gray-200 rounded w-3/4" />
                <div className="h-2 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto pb-24 lg:pb-8">
        <div className="px-4 pt-0 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
          {children}
        </div>
      </main>

      <div className="fixed right-4 bottom-20 z-40 lg:hidden">
        {quickActionsOpen && (
          <button
            type="button"
            aria-label="Fermer les actions rapides"
            className="fixed inset-0 z-30 bg-transparent"
            onClick={() => setQuickActionsOpen(false)}
          />
        )}
        {quickActionsOpen && (
          <div className="absolute z-40 bottom-16 right-0 w-56 bg-white border border-gray-200 rounded-xl shadow-lg p-2 space-y-1">
            <Link
              href="/dashboard/customers?new=1"
              onClick={() => setQuickActionsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              <UserPlus className="h-4 w-4 text-blue-600" />
              Nouveau client
            </Link>
            <Link
              href="/dashboard/programs?new=1"
              onClick={() => setQuickActionsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              <Stamp className="h-4 w-4 text-blue-600" />
              Nouveau programme
            </Link>
            <button
              type="button"
              onClick={goToQrFocus}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              <QrCode className="h-4 w-4 text-blue-600" />
              QR d'inscription
            </button>
            <Link
              href="/dashboard/business"
              onClick={() => setQuickActionsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              <Store className="h-4 w-4 text-blue-600" />
              Mon établissement
            </Link>
            <Link
              href="/dashboard/billing"
              onClick={() => setQuickActionsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              <CreditCard className="h-4 w-4 text-blue-600" />
              Abonnement
            </Link>
            <Link
              href="/dashboard/settings"
              onClick={() => setQuickActionsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              <Settings className="h-4 w-4 text-blue-600" />
              Paramètres
            </Link>
          </div>
        )}
        <button
          onClick={() => setQuickActionsOpen((v) => !v)}
          className="relative z-40 w-14 h-14 rounded-full bg-blue-600 text-white shadow-xl flex items-center justify-center"
          aria-label="Ouvrir les actions rapides"
        >
          {quickActionsOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </button>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white border-t border-gray-200 px-2 py-2">
        <div className="grid grid-cols-5 gap-1">
          {primaryMobileNav.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg py-1.5 ${
                  isActive ? "text-blue-700 bg-blue-50" : "text-gray-500"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] leading-none">{item.label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {showOnboarding && (
        <OnboardingModal onClose={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}

// ─── Modale d'onboarding — wizard 4 étapes affiché à la 1ère connexion ───────

function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [programId, setProgramId] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Étape 1 — établissement
  const [bizName, setBizName] = useState("");
  const [bizType, setBizType] = useState("salon_coiffure");

  // Étape 2 — logo
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  // Étape 3 — programme
  const [threshold, setThreshold] = useState("10");
  const [reward, setReward] = useState("10€ de réduction");

  // Étape 4 — design
  const [bgColor, setBgColor] = useState("#1a1a2e");
  const [textColor, setTextColor] = useState<"light" | "dark">("light");

  // Pré-remplissage depuis l'API
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    fetch(`${API_URL}/api/v1/business`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.name && data.name !== "Mon établissement") setBizName(data.name);
        const prog = data.programs?.[0];
        if (prog) {
          setProgramId(prog.id);
          const cfg = prog.config_json ?? {};
          if (cfg.threshold)        setThreshold(String(cfg.threshold));
          if (cfg.reward_label)     setReward(cfg.reward_label);
          if (cfg.background_color) setBgColor(cfg.background_color);
          if (cfg.text_color)       setTextColor(cfg.text_color);
        }
      })
      .catch(() => {});
  }, []);

  // Upload logo en temps réel
  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) { setError("Format non supporté (JPG, PNG, SVG, WEBP)."); return; }
    if (file.size > 2 * 1024 * 1024)  { setError("Fichier trop volumineux (max 2 Mo)."); return; }
    setError(null);
    setLogoPreview(URL.createObjectURL(file));
    setLogoUploading(true);
    const token = localStorage.getItem("access_token");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${API_URL}/api/v1/business/logo`, {
        method: "POST", headers: { Authorization: `Bearer ${token ?? ""}` }, body: fd,
      });
      const data = await res.json();
      if (res.ok) setLogoPreview(data.logo_url);
      else { setError(data.message ?? "Erreur upload."); setLogoPreview(null); }
    } catch {
      setError("Impossible de contacter l'API.");
      setLogoPreview(null);
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  // Sauvegarde finale (étape 4)
  async function handleFinish() {
    const t = parseInt(threshold, 10);
    if (isNaN(t) || t < 1 || t > 50) { setError("Nombre de tampons : entre 1 et 50."); return; }
    if (reward.trim().length < 2)     { setError("Décrivez la récompense."); return; }
    setError(null);
    setSaving(true);
    const token = localStorage.getItem("access_token");
    try {
      // 1. Nom + type d'établissement
      if (bizName.trim().length >= 2) {
        await fetch(`${API_URL}/api/v1/business`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
          body: JSON.stringify({ name: bizName.trim(), settings_json: { establishment_type: bizType } }),
        });
      }
      // 2. Programme + design (une seule requête avec versioning)
      if (programId) {
        const res = await fetch(`${API_URL}/api/v1/business/programs/${programId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
          body: JSON.stringify({
            name: "Carte fidélité",
            config: { threshold: t, reward_label: reward.trim(), background_color: bgColor, text_color: textColor },
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          setError(d.message ?? "Erreur lors de la sauvegarde.");
          return;
        }
      }
      onClose();
    } catch {
      setError("Impossible de contacter l'API.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">

        {/* Barre de progression */}
        <div className="flex h-1 shrink-0">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`flex-1 transition-colors ${s <= step ? "bg-blue-500" : "bg-gray-100"}`} />
          ))}
        </div>

        {/* En-tête */}
        <div className="px-8 pt-7 pb-5 border-b border-gray-100 shrink-0">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-0.5">
            Étape {step} / 4
          </p>
          <h2 className="text-xl font-bold text-gray-900">
            {step === 1 && "Votre établissement"}
            {step === 2 && "Votre logo"}
            {step === 3 && "Programme de fidélité"}
            {step === 4 && "Design de votre carte"}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {step === 1 && "Ce nom sera permanent et utilisé dans l'URL de votre QR code d'inscription."}
            {step === 2 && "Optionnel — personnalisez votre carte fidélité avec votre logo."}
            {step === 3 && "Définissez les règles de votre programme de tampons."}
            {step === 4 && "Choisissez les couleurs de votre carte Apple Wallet et Google Wallet."}
          </p>
        </div>

        {/* Contenu (défilable sur mobile) */}
        <div className="px-8 py-6 space-y-4 overflow-y-auto">

          {/* ── Étape 1 : Établissement ── */}
          {step === 1 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom de l'établissement
                </label>
                <input
                  type="text" autoFocus required minLength={2}
                  placeholder="Ex : Salon Élégance, BB Dynasty…"
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type d'établissement
                </label>
                <select value={bizType} onChange={(e) => setBizType(e.target.value)} className={inputCls}>
                  {ESTABLISHMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <span className="text-base mt-0.5" aria-hidden>🔒</span>
                <p className="text-xs text-amber-700">
                  <strong className="font-semibold text-amber-800">Ce nom sera permanent.</strong>{" "}
                  Il déterminera l'URL de votre QR code (/join/…). Il ne pourra plus être modifié.
                </p>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <button
                onClick={() => {
                  if (bizName.trim().length < 2) { setError("Le nom doit faire au moins 2 caractères."); return; }
                  setError(null); setStep(2);
                }}
                className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                Continuer →
              </button>
            </>
          )}

          {/* ── Étape 2 : Logo ── */}
          {step === 2 && (
            <>
              <div className="flex items-center gap-4">
                {logoPreview ? (
                  <div className="relative shrink-0">
                    <img src={logoPreview} alt="Logo" className="w-20 h-20 rounded-xl object-cover border border-gray-200" />
                    <button
                      type="button"
                      onClick={() => setLogoPreview(null)}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {logoUploading && (
                      <div className="absolute inset-0 rounded-xl bg-white/80 flex items-center justify-center">
                        <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    onClick={() => logoInputRef.current?.click()}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 cursor-pointer hover:border-blue-400 hover:text-blue-500 transition-colors shrink-0"
                  >
                    <Store className="h-6 w-6" />
                    <span className="text-xs">Logo</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled={logoUploading}
                    onClick={() => logoInputRef.current?.click()}
                    className="inline-flex items-center gap-2 py-1.5 px-3 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    {logoUploading ? "Upload en cours…" : logoPreview ? "Changer" : "Choisir un fichier"}
                  </button>
                  <p className="text-xs text-gray-400">JPG, PNG, SVG, WEBP — max 2 Mo</p>
                </div>
              </div>
              <input
                ref={logoInputRef} type="file"
                accept="image/jpeg,image/png,image/svg+xml,image/webp"
                onChange={handleLogoFile} className="hidden"
              />
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => { setError(null); setStep(1); }}
                  className="py-2 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  ← Retour
                </button>
                <button type="button" disabled={logoUploading} onClick={() => { setError(null); setStep(3); }}
                  className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {logoPreview ? "Continuer →" : "Passer cette étape →"}
                </button>
              </div>
            </>
          )}

          {/* ── Étape 3 : Programme ── */}
          {step === 3 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de tampons pour une récompense
                </label>
                <div className="flex items-center gap-3">
                  <input type="number" min={1} max={50} value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <span className="text-sm text-gray-500">tampons</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description de la récompense
                </label>
                <input type="text" placeholder="Ex : 10€ de réduction, 1 soin offert…"
                  value={reward} onChange={(e) => setReward(e.target.value)}
                  className={inputCls} />
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                <p className="font-semibold mb-0.5">{bizName || "Votre établissement"}</p>
                <p>Après <strong>{threshold || "?"} tampons</strong> → <strong>{reward || "…"}</strong></p>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => { setError(null); setStep(2); }}
                  className="py-2 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  ← Retour
                </button>
                <button type="button" onClick={() => {
                  const t = parseInt(threshold, 10);
                  if (isNaN(t) || t < 1 || t > 50) { setError("Nombre de tampons : entre 1 et 50."); return; }
                  if (reward.trim().length < 2)     { setError("Décrivez la récompense."); return; }
                  setError(null); setStep(4);
                }}
                  className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  Continuer →
                </button>
              </div>
            </>
          )}

          {/* ── Étape 4 : Design ── */}
          {step === 4 && (
            <>
              {/* Aperçu mini-carte */}
              <div
                className="rounded-xl p-4 transition-colors"
                style={{ backgroundColor: bgColor, color: textColor === "dark" ? "#111" : "#fff" }}
              >
                <p className="text-xs font-semibold opacity-70 mb-0.5">TAMPONS</p>
                <p className="text-lg font-bold tracking-wide">{"●".repeat(3)}{"○".repeat(7)}</p>
                <p className="text-sm mt-1 opacity-80">{bizName || "Votre établissement"}</p>
                <p className="text-xs opacity-60 mt-0.5">{reward}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Couleur de fond</p>
                <div className="flex flex-wrap gap-2">
                  {SETUP_COLORS.map((c) => (
                    <button
                      key={c} type="button"
                      onClick={() => setBgColor(c)}
                      className={`w-9 h-9 rounded-lg border-2 transition-all ${bgColor === c ? "border-blue-500 scale-110 shadow-md" : "border-transparent hover:scale-105"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Couleur actuelle : {bgColor}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Couleur du texte</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setTextColor("light")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${textColor === "light" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                    ○ Texte clair
                  </button>
                  <button type="button" onClick={() => setTextColor("dark")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${textColor === "dark" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                    ● Texte foncé
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  Choisissez "Texte clair" pour les fonds sombres.
                </p>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setError(null); setStep(3); }}
                  className="py-2 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  ← Retour
                </button>
                <button type="button" onClick={handleFinish} disabled={saving}
                  className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {saving ? "Enregistrement…" : "Terminer et accéder au dashboard →"}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
