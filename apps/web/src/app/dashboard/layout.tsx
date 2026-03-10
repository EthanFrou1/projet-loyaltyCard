"use client";

import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
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
  ScanLine,
  X,
  Plus,
  UserPlus,
  QrCode,
  Upload,
  Search,
  CheckCircle,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { mutate as swrMutate } from "swr";

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
const STAMP_THRESHOLD_OPTIONS = Array.from({ length: 8 }, (_, i) => String(i + 8));

const SETUP_COLORS = [
  "#1a1a2e", "#1e3a5f", "#1a3a2a", "#2d1b4e",
  "#8b4513", "#2a2a2a", "#1e3a4f", "#4a1515",
];

const navItems = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/customers", label: "Clients", icon: Users, exact: false },
  { href: "/dashboard/programs", label: "Programmes", icon: Stamp, exact: false },
  { href: "/dashboard/scan", label: "Scan", icon: ScanLine, exact: false },
  { href: "/dashboard/ai", label: "Outils IA", icon: Sparkles, exact: false },
  { href: "/dashboard/business", label: "Mon établissement", icon: Store, exact: false },
  { href: "/dashboard/billing", label: "Abonnement", icon: CreditCard, exact: false },
  { href: "/dashboard/settings", label: "Paramètres", icon: Settings, exact: false },
];

interface UserProfile {
  email: string;
  role: string;
  business: { name: string; plan: string };
  setup?: {
    requires_onboarding: boolean;
    missing_steps: string[];
  };
}

interface BusinessSummary {
  programs?: Array<{ status: "ACTIVE" | "ARCHIVED" }>;
}

const planStyles: Record<string, { label: string; className: string }> = {
  STARTER: { label: "Starter", className: "bg-gray-100 text-gray-600" },
  PRO: { label: "Pro", className: "bg-slate-200 text-emerald-700" },
  BUSINESS: { label: "Business", className: "bg-violet-100 text-violet-700" },
};
const PLAN_LIMITS: Record<string, number> = { STARTER: 1, PRO: 3, BUSINESS: Infinity };

const fallbackPlanStyle = { label: "Starter", className: "bg-gray-100 text-gray-600" };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeProgramCount, setActiveProgramCount] = useState<number | null>(null);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const isOwner = user?.role === "OWNER" || user?.role === "ADMIN";

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
      return;
    }

    // Charger le profil utilisateur + état onboarding
    fetch(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setUser(data);
        const ownerRole = data.role === "OWNER" || data.role === "ADMIN";
        if (ownerRole && data.setup?.requires_onboarding) setShowOnboarding(true);
      })
      .catch(() => {});

    fetch(`${API_URL}/api/v1/business`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: BusinessSummary | null) => {
        const count = data?.programs?.filter((p) => p.status === "ACTIVE").length ?? 0;
        setActiveProgramCount(count);
      })
      .catch(() => {
        setActiveProgramCount(0);
      });
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

  const visibleNavItems = navItems.filter((item) => {
    if (isOwner) return true;
    return !["/dashboard/business", "/dashboard/billing"].includes(item.href);
  });
  const primaryMobileNav = visibleNavItems.slice(0, 5);
  const currentPlanStyle = user?.business?.plan
    ? (planStyles[user.business.plan] ?? fallbackPlanStyle)
    : fallbackPlanStyle;
  const currentPlan = user?.business?.plan ?? "STARTER";
  const planLimit = PLAN_LIMITS[currentPlan] ?? 1;
  const canCreateProgram = isOwner && activeProgramCount !== null && activeProgramCount < planLimit;

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="hidden lg:flex w-64 flex-col bg-gradient-to-b from-slate-800 to-slate-700 shadow-xl">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/10">
          <Link href="/dashboard" className="inline-block min-w-0">
            <Image
              src="/brand/logo-horizontal-darkbg.png"
              alt="FidélitéPro+"
              width={2035}
              height={518}
              className="h-10 w-auto"
              priority
            />
          </Link>
          {user?.business?.name && (
            <div className="">
              <div className="-mx-5 border-t border-white/10" />
              <div className="pt-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">Etablissement</p>
                <p className="mt-2 truncate text-base font-semibold text-white">{user.business.name}</p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-emerald-500/20 text-white"
                    : "text-zinc-400 hover:bg-white/6 hover:text-zinc-200"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 transition-colors ${isActive ? "text-emerald-400" : ""}`} />
                <span className="flex-1">{item.label}</span>
                {isActive && <div className="w-1 h-4 rounded-full bg-emerald-400 shrink-0" />}
              </Link>
            );
          })}
        </nav>

        {/* Badge plan */}
        {user?.business?.plan && (
          <div className="px-3 pb-3">
            <Link
              href="/dashboard/billing"
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-semibold bg-white/8 border border-white/10 text-zinc-300 hover:bg-white/12 transition-colors"
            >
              <CreditCard className="h-3 w-3 shrink-0" />
              Plan {currentPlanStyle.label}
            </Link>
          </div>
        )}

        {/* Utilisateur */}
        <div className="p-4 border-t border-white/10">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-semibold shrink-0">
                {user.email.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{user.email}</p>
                <p className="text-xs text-zinc-500 capitalize">{user.role.toLowerCase()}</p>
              </div>
              <button
                onClick={handleLogout}
                title="Se déconnecter"
                className="text-zinc-500 hover:text-red-400 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-zinc-800" />
              <div className="flex-1 space-y-1">
                <div className="h-2.5 bg-zinc-800 rounded w-3/4" />
                <div className="h-2 bg-zinc-800 rounded w-1/2" />
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto pb-24 lg:pb-8">
        <div className="px-4 pt-0 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
          <Suspense>
            {children}
          </Suspense>
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
          <div className="absolute z-40 bottom-16 right-0 w-56 bg-slate-900 border border-white/10 rounded-xl shadow-xl p-2 space-y-0.5">
            <Link
              href="/dashboard/customers?new=1"
              onClick={() => setQuickActionsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <UserPlus className="h-4 w-4 text-emerald-400" />
              Nouveau client
            </Link>
            {canCreateProgram && (
              <Link
                href="/dashboard/programs?new=1"
                onClick={() => setQuickActionsOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Stamp className="h-4 w-4 text-emerald-400" />
                Nouveau programme
              </Link>
            )}
            <button
              type="button"
              onClick={goToQrFocus}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors w-full"
            >
              <QrCode className="h-4 w-4 text-emerald-400" />
              QR d'inscription
            </button>
            <Link
              href="/dashboard/scan"
              onClick={() => setQuickActionsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <ScanLine className="h-4 w-4 text-emerald-400" />
              Scanner client
            </Link>
            <Link
              href="/dashboard/business"
              onClick={() => setQuickActionsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Store className="h-4 w-4 text-emerald-400" />
              Mon établissement
            </Link>
            <Link
              href="/dashboard/billing"
              onClick={() => setQuickActionsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <CreditCard className="h-4 w-4 text-emerald-400" />
              Abonnement
            </Link>
            <Link
              href="/dashboard/settings"
              onClick={() => setQuickActionsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Settings className="h-4 w-4 text-emerald-400" />
              Paramètres
            </Link>
          </div>
        )}
        <button
          onClick={() => setQuickActionsOpen((v) => !v)}
          className="relative z-40 w-14 h-14 rounded-full bg-emerald-500 text-white shadow-xl flex items-center justify-center"
          aria-label="Ouvrir les actions rapides"
        >
          {quickActionsOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </button>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-slate-900 border-t border-white/10 px-2 py-2">
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
                className={`flex flex-col items-center justify-center gap-1 rounded-lg py-1.5 transition-colors ${
                  isActive ? "text-amber-400" : "text-slate-400"
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
        <OnboardingModal
          onCompleted={() => setShowOnboarding(false)}
        />
      )}
    </div>
  );
}

// ─── Modale d'onboarding — wizard 4 étapes affiché à la 1ère connexion ───────

function OnboardingModal({ onCompleted }: { onCompleted: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [programId, setProgramId] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const gmbTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Étape 1 — établissement
  const [bizName, setBizName] = useState("");
  const [bizType, setBizType] = useState("salon_coiffure");
  const [bizAddress, setBizAddress] = useState("");
  const [bizPhone, setBizPhone] = useState("");
  const [bizPlaceId, setBizPlaceId] = useState<string | null>(null);
  const [gmbResults, setGmbResults] = useState<Array<{ place_id: string; name: string; address: string; type: string }>>([]);
  const [gmbLoading, setGmbLoading] = useState(false);
  const [gmbOpen, setGmbOpen] = useState(false);
  const [gmbImported, setGmbImported] = useState(false);

  // Étape 2 — apparence (logo + photo établissement)
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [gmbPhotos, setGmbPhotos] = useState<string[]>([]);
  const [applyingPhoto, setApplyingPhoto] = useState<string | null>(null);
  const [applyingCoverPhoto, setApplyingCoverPhoto] = useState<string | null>(null);

  // Étape 3 — programme
  const [threshold, setThreshold] = useState("10");
  const [reward, setReward] = useState("10€ de réduction");
  const thresholdOptions = STAMP_THRESHOLD_OPTIONS.includes(threshold)
    ? STAMP_THRESHOLD_OPTIONS
    : [threshold, ...STAMP_THRESHOLD_OPTIONS];

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
        if (data.name) setBizName(data.name);
        if (data.logo_url) setLogoPreview(data.logo_url);
        if (data.cover_photo_url) setCoverPreview(data.cover_photo_url);
        const s = data.settings_json ?? {};
        if (s.establishment_type) setBizType(s.establishment_type);
        if (s.address)            setBizAddress(s.address);
        if (s.phone)              setBizPhone(s.phone);
        const prog = data.programs?.[0];
        if (prog) {
          setProgramId(prog.id);
          const cfg = prog.config_json ?? {};
          if (cfg.threshold) setThreshold(String(cfg.threshold));
          if (cfg.reward_label)     setReward(cfg.reward_label);
          if (cfg.background_color) setBgColor(cfg.background_color);
          if (cfg.text_color)       setTextColor(cfg.text_color);
        }
      })
      .catch(() => {});
  }, []);

  // Recherche Google My Business via le backend
  function handleGmbInput(value: string) {
    setGmbImported(false);
    if (gmbTimeout.current) clearTimeout(gmbTimeout.current);
    if (value.trim().length < 2) { setGmbResults([]); return; }
    gmbTimeout.current = setTimeout(async () => {
      setGmbLoading(true);
      try {
        const results = await apiClient.get<Array<{ place_id: string; name: string; address: string; type: string }>>(
          `/business/places/search?query=${encodeURIComponent(value)}`
        );
        setGmbResults(results);
      } catch {
        // silencieux
      } finally {
        setGmbLoading(false);
      }
    }, 400);
  }

  async function selectGmbPlace(placeId: string) {
    setGmbResults([]);
    setGmbLoading(true);
    try {
      const details = await apiClient.get<{ name?: string; address?: string; phone?: string; type?: string; photo_urls?: string[] }>(
        `/business/places/details?place_id=${placeId}`
      );
      setBizPlaceId(placeId);
      if (details.name)    setBizName(details.name);
      if (details.address) setBizAddress(details.address);
      if (details.phone)   setBizPhone(details.phone);
      if (details.type)    setBizType(details.type);
      if (details.photo_urls?.length) setGmbPhotos(details.photo_urls);
      setGmbOpen(false);
      setGmbImported(true);
    } finally {
      setGmbLoading(false);
    }
  }

  // Appliquer une photo Google comme logo (télécharge et upload sur R2)
  async function applyGmbPhoto(url: string) {
    setApplyingPhoto(url);
    try {
      const data = await apiClient.post<{ logo_url: string }>("/business/logo-from-url", { url });
      setLogoPreview(data.logo_url);
    } catch {
      setError("Impossible d'appliquer cette photo.");
    } finally {
      setApplyingPhoto(null);
    }
  }

  // Appliquer une photo Google comme cover photo (bannière Wallet)
  async function applyGmbCoverPhoto(url: string) {
    setApplyingCoverPhoto(url);
    try {
      const data = await apiClient.post<{ cover_photo_url: string }>("/business/cover-photo-from-url", { url });
      setCoverPreview(data.cover_photo_url);
    } catch {
      setError("Impossible d'appliquer cette photo d'établissement.");
    } finally {
      setApplyingCoverPhoto(null);
    }
  }

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

  // Upload photo établissement en temps réel
  async function handleCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { setError("Format non supporté pour la photo (JPG, PNG, WEBP)."); return; }
    if (file.size > 5 * 1024 * 1024)  { setError("Photo trop volumineuse (max 5 Mo)."); return; }
    setError(null);
    setCoverPreview(URL.createObjectURL(file));
    setCoverUploading(true);
    const token = localStorage.getItem("access_token");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${API_URL}/api/v1/business/cover-photo`, {
        method: "POST", headers: { Authorization: `Bearer ${token ?? ""}` }, body: fd,
      });
      const data = await res.json();
      if (res.ok) setCoverPreview(data.cover_photo_url);
      else { setError(data.message ?? "Erreur upload photo."); setCoverPreview(null); }
    } catch {
      setError("Impossible de contacter l'API.");
      setCoverPreview(null);
    } finally {
      setCoverUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  // Sauvegarde finale (étape 4)
  async function handleFinish() {
    if (!thresholdOptions.includes(threshold)) {
      setError("Choisissez un nombre de tampons entre 8 et 15.");
      return;
    }
    const t = parseInt(threshold, 10);
    if (reward.trim().length < 2)     { setError("Décrivez la récompense."); return; }
    setError(null);
    setSaving(true);
    const token = localStorage.getItem("access_token");
    try {
      // 1. Nom + type d'établissement + adresse + téléphone
      const bizRes = await fetch(`${API_URL}/api/v1/business`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({
          name: bizName.trim(),
          settings_json: {
            establishment_type: bizType,
            ...(bizAddress  && { address:  bizAddress }),
            ...(bizPhone    && { phone:    bizPhone }),
            ...(bizPlaceId  && { place_id: bizPlaceId }),
          },
        }),
      });
      if (!bizRes.ok) {
        const d = await bizRes.json();
        setError(d.message ?? "Erreur lors de la sauvegarde de l'établissement.");
        return;
      }

      // 2. Programme + design — créer si inexistant, sinon mettre à jour
      const programPayload = {
        name: "Carte fidélité",
        config: { threshold: t, reward_label: reward.trim(), background_color: bgColor, text_color: textColor },
      };
      const progRes = programId
        ? await fetch(`${API_URL}/api/v1/business/programs/${programId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
            body: JSON.stringify(programPayload),
          })
        : await fetch(`${API_URL}/api/v1/business/programs`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
            body: JSON.stringify({ ...programPayload, type: "STAMPS" }),
          });

      if (!progRes.ok) {
        const d = await progRes.json();
        setError(d.message ?? "Erreur lors de la sauvegarde du programme.");
        return;
      }
      // Invalider le cache SWR pour forcer un re-fetch immédiat dans le dashboard
      await swrMutate("/business");
      await swrMutate("/business/stats");
      onCompleted();
    } catch {
      setError("Impossible de contacter l'API.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">

        {/* Barre de progression */}
        <div className="flex h-1 shrink-0">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`flex-1 transition-colors ${s <= step ? "bg-slate-700" : "bg-gray-100"}`} />
          ))}
        </div>

        {/* En-tête */}
        <div className="px-8 pt-7 pb-5 border-b border-gray-100 shrink-0">
          <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-0.5">
            Étape {step} / 4
          </p>
            <h2 className="text-xl font-bold text-gray-900">
              {step === 1 && "Votre établissement"}
              {step === 2 && "Votre apparence"}
              {step === 3 && "Programme de fidélité"}
              {step === 4 && "Design de votre carte"}
            </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {step === 1 && "Recherchez votre établissement sur Google pour le sélectionner, ou tapez son nom manuellement."}
            {step === 2 && "Optionnel — ajoutez un logo et une photo d'établissement pour vos cartes Wallet."}
            {step === 3 && "Définissez les règles de votre programme de tampons."}
            {step === 4 && "Choisissez les couleurs de votre carte Apple Wallet et Google Wallet."}
          </p>
        </div>

        {/* Contenu (défilable sur mobile) */}
        <div className="px-8 py-6 space-y-4 overflow-y-auto">

          {/* ── Étape 1 : Établissement ── */}
          {step === 1 && (
            <>
              {/* Nom + dropdown Google My Business */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom de l'établissement
                </label>
                <div className="relative">
                  <input
                    type="text" autoFocus required minLength={2}
                    placeholder="Recherchez votre établissement sur Google…"
                    value={bizName}
                    onChange={(e) => {
                      setBizName(e.target.value);
                      setGmbImported(false);
                      setGmbOpen(true);
                      handleGmbInput(e.target.value);
                    }}
                    onFocus={() => { if (bizName.trim().length >= 2) setGmbOpen(true); }}
                    onBlur={() => setTimeout(() => setGmbOpen(false), 150)}
                    className={inputCls}
                  />
                  {gmbLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-1">
                  <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="text-xs text-gray-400">Suggestions Google My Business</span>
                </div>

                {/* Dropdown résultats */}
                {gmbOpen && gmbResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {gmbResults.map((r) => (
                      <button
                        key={r.place_id} type="button"
                        onMouseDown={() => selectGmbPlace(r.place_id)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-100 transition-colors border-b border-gray-50 last:border-0"
                      >
                        <Search className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                          <p className="text-xs text-gray-400 truncate">{r.address}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Confirmation import */}
                {gmbImported && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                    <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                    Données importées depuis Google — vérifiez et continuez.
                  </div>
                )}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Adresse
                </label>
                <input
                  type="text"
                  placeholder="12 rue de la Paix, 75001 Paris"
                  value={bizAddress}
                  onChange={(e) => setBizAddress(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Téléphone
                </label>
                <input
                  type="tel"
                  placeholder="Ex : 06 12 34 56 78"
                  value={bizPhone}
                  onChange={(e) => setBizPhone(e.target.value)}
                  className={inputCls}
                />
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <button
                onClick={() => {
                  if (bizName.trim().length < 2) { setError("Le nom doit faire au moins 2 caractères."); return; }
                  setError(null); setStep(2);
                }}
                className="w-full py-2.5 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-600 transition-colors text-sm"
              >
                Continuer →
              </button>
            </>
          )}

          {/* ── Étape 2 : Logo ── */}
          {step === 2 && (
            <>
              {/* Aperçu logo sélectionné */}
              {logoPreview && (
                <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                  <div className="relative shrink-0">
                    <img src={logoPreview} alt="Logo" className="w-14 h-14 rounded-xl object-cover border border-gray-200" />
                    <button type="button" onClick={() => setLogoPreview(null)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-800">Logo sélectionné ✓</p>
                    <p className="text-xs text-green-600">Uploadé sur votre espace</p>
                  </div>
                </div>
              )}

              {/* Photos Google My Business */}
              {!logoPreview && gmbPhotos.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Photos de votre établissement sur Google
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {gmbPhotos.map((url, i) => (
                      <button
                        key={i} type="button"
                        disabled={applyingPhoto !== null}
                        onClick={() => applyGmbPhoto(url)}
                        className="relative aspect-square rounded-xl overflow-hidden border-2 border-gray-200 hover:border-slate-400 hover:scale-105 transition-all disabled:opacity-60 group"
                      >
                        <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 text-white text-[10px] font-semibold transition-opacity">
                            Choisir
                          </span>
                        </div>
                        {applyingPhoto === url && (
                          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                            <div className="h-4 w-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">Cliquez sur une photo pour l'utiliser comme logo — elle sera uploadée sur votre espace.</p>
                </div>
              )}

              {/* Upload manuel */}
              {!logoPreview && (
                <div className={`flex items-center gap-4 ${gmbPhotos.length > 0 ? "pt-3 border-t border-gray-100" : ""}`}>
                  <div
                    onClick={() => logoInputRef.current?.click()}
                    className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 cursor-pointer hover:border-slate-400 hover:text-slate-600 transition-colors shrink-0"
                  >
                    <Store className="h-5 w-5" />
                    <span className="text-xs">Logo</span>
                  </div>
                  <div className="space-y-1">
                    <button type="button" disabled={logoUploading} onClick={() => logoInputRef.current?.click()}
                      className="inline-flex items-center gap-2 py-1.5 px-3 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      <Upload className="h-4 w-4" />
                      {logoUploading ? "Upload en cours…" : gmbPhotos.length > 0 ? "Ou uploader votre propre logo" : "Choisir un fichier"}
                    </button>
                    <p className="text-xs text-gray-400">JPG, PNG, SVG, WEBP — max 2 Mo</p>
                  </div>
                </div>
              )}

              <input ref={logoInputRef} type="file"
                accept="image/jpeg,image/png,image/svg+xml,image/webp"
                onChange={handleLogoFile} className="hidden" />

              {/* Photo établissement (bannière) */}
              <div className="pt-4 border-t border-gray-100 space-y-3">
                <p className="text-sm font-medium text-gray-700">Photo de l'établissement (bannière)</p>

                {coverPreview && (
                  <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                    <div className="relative shrink-0">
                      <img src={coverPreview} alt="Photo établissement" className="w-16 h-12 rounded-lg object-cover border border-gray-200" />
                      <button type="button" onClick={() => setCoverPreview(null)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-800">Photo sélectionnée ✓</p>
                      <p className="text-xs text-green-600">Affichée sur la bannière Wallet</p>
                    </div>
                  </div>
                )}

                {!coverPreview && gmbPhotos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Choisir depuis Google
                    </p>
                    <div className="grid grid-cols-5 gap-2">
                      {gmbPhotos.map((url, i) => (
                        <button
                          key={`cover-${i}`} type="button"
                          disabled={applyingCoverPhoto !== null}
                          onClick={() => applyGmbCoverPhoto(url)}
                          className="relative aspect-square rounded-xl overflow-hidden border-2 border-gray-200 hover:border-slate-400 hover:scale-105 transition-all disabled:opacity-60 group"
                        >
                          <img src={url} alt={`Photo établissement ${i + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 text-white text-[10px] font-semibold transition-opacity">
                              Choisir
                            </span>
                          </div>
                          {applyingCoverPhoto === url && (
                            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                              <div className="h-4 w-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!coverPreview && (
                  <div className={`flex items-center gap-4 ${gmbPhotos.length > 0 ? "pt-3 border-t border-gray-100" : ""}`}>
                    <div
                      onClick={() => coverInputRef.current?.click()}
                      className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 cursor-pointer hover:border-slate-400 hover:text-slate-600 transition-colors shrink-0"
                    >
                      <Store className="h-5 w-5" />
                      <span className="text-xs">Photo</span>
                    </div>
                    <div className="space-y-1">
                      <button type="button" disabled={coverUploading} onClick={() => coverInputRef.current?.click()}
                        className="inline-flex items-center gap-2 py-1.5 px-3 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
                        <Upload className="h-4 w-4" />
                        {coverUploading ? "Upload en cours…" : "Choisir une photo"}
                      </button>
                      <p className="text-xs text-gray-400">JPG, PNG, WEBP — max 5 Mo</p>
                    </div>
                  </div>
                )}

                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCoverFile}
                  className="hidden"
                />
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => { setError(null); setStep(1); }}
                  className="py-2 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  ← Retour
                </button>
                <button type="button" disabled={logoUploading || coverUploading || applyingPhoto !== null || applyingCoverPhoto !== null}
                  onClick={() => { setError(null); setStep(3); }}
                  className="flex-1 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors">
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
                  <select value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500">
                    {thresholdOptions.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
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
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-sm text-emerald-700">
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
                  if (!thresholdOptions.includes(threshold)) { setError("Choisissez un nombre de tampons entre 8 et 15."); return; }
                  if (reward.trim().length < 2)     { setError("Décrivez la récompense."); return; }
                  setError(null); setStep(4);
                }}
                  className="flex-1 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors">
                  Continuer →
                </button>
              </div>
            </>
          )}

          {/* ── Étape 4 : Design ── */}
          {step === 4 && (
            <>
              {/* Aperçu Apple Wallet */}
              <AppleCard
                businessName={bizName || "Votre établissement"}
                logoUrl={logoPreview}
                programName="Carte fidélité"
                threshold={parseInt(threshold, 10) || 10}
                rewardLabel={reward || "Récompense"}
                bgColor={bgColor}
                textColor={textColor}
              />

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Couleur de fond</p>
                <div className="flex flex-wrap gap-2">
                  {SETUP_COLORS.map((c) => (
                    <button
                      key={c} type="button"
                      onClick={() => setBgColor(c)}
                      className={`w-9 h-9 rounded-lg border-2 transition-all ${bgColor === c ? "border-slate-500 scale-110 shadow-md" : "border-transparent hover:scale-105"}`}
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
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${textColor === "light" ? "border-slate-500 bg-slate-100 text-emerald-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                    ○ Texte clair
                  </button>
                  <button type="button" onClick={() => setTextColor("dark")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${textColor === "dark" ? "border-slate-500 bg-slate-100 text-emerald-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
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
                  className="flex-1 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors">
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

// ─── Apple Wallet mockup (réutilisé dans l'étape 4 de l'onboarding) ──────────

interface CardPreviewProps {
  businessName: string;
  logoUrl: string | null;
  programName: string;
  threshold: number;
  rewardLabel: string;
  bgColor: string;
  textColor: "light" | "dark";
}

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
        <OnboardingQrSvg size={56} />
        <p className="text-[8px] text-gray-400 tracking-wide">QR Code</p>
      </div>
    </div>
  );
}

function OnboardingQrSvg({ size = 56 }: { size?: number }) {
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
