"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
    </div>
  );
}
