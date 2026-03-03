"use client";

/**
 * Layout du dashboard — sidebar + zone de contenu principale.
 * Toutes les pages sous dashboard/ héritent de ce layout.
 *
 * - L'onglet actif est mis en surbrillance selon l'URL courante.
 * - Le badge utilisateur (email + rôle) est affiché en bas de la sidebar.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Users, LayoutDashboard, Sparkles, Settings, LogOut, Store, CreditCard } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const navItems = [
  { href: "/dashboard",           label: "Tableau de bord",    icon: LayoutDashboard, exact: true  },
  { href: "/dashboard/customers", label: "Clients",            icon: Users,           exact: false },
  { href: "/dashboard/ai",        label: "Outils IA",          icon: Sparkles,        exact: false },
  { href: "/dashboard/business",  label: "Mon établissement",  icon: Store,           exact: false },
  { href: "/dashboard/billing",   label: "Abonnement",         icon: CreditCard,      exact: false },
  { href: "/dashboard/settings",  label: "Paramètres",         icon: Settings,        exact: false },
];

interface UserProfile {
  email: string;
  role: string;
  business: { name: string; plan: string };
}

const planStyles: Record<string, { label: string; className: string }> = {
  STARTER:  { label: "Starter",  className: "bg-gray-100 text-gray-600" },
  PRO:      { label: "Pro",      className: "bg-blue-100 text-blue-700" },
  BUSINESS: { label: "Business", className: "bg-violet-100 text-violet-700" },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);

  // Charger le profil de l'utilisateur connecté pour le badge
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

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    router.push("/login");
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* ── Sidebar ── */}
      <aside className="w-64 bg-white shadow-sm flex flex-col">

        {/* Logo */}
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold text-gray-900">LoyaltyCard</h1>
          {user?.business?.name && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{user.business.name}</p>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            // Correspondance exacte pour /dashboard, préfixe pour les sous-routes
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

        {/* Badge abonnement (cliquable → /dashboard/billing) */}
        {user?.business?.plan && (
          <div className="px-4 pb-2">
            <Link
              href="/dashboard/billing"
              className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-80 ${
                planStyles[user.business.plan]?.className ?? planStyles.STARTER.className
              }`}
            >
              <CreditCard className="h-3 w-3 shrink-0" />
              Plan {planStyles[user.business.plan]?.label ?? "Starter"}
            </Link>
          </div>
        )}

        {/* Badge utilisateur */}
        <div className="p-4 border-t">
          {user ? (
            <div className="flex items-center gap-3">
              {/* Avatar initiale */}
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">
                {user.email[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">{user.email}</p>
                <p className="text-xs text-gray-400 capitalize">{user.role.toLowerCase()}</p>
              </div>
              {/* Déconnexion */}
              <button
                onClick={handleLogout}
                title="Se déconnecter"
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            // Skeleton pendant le chargement
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

      {/* Zone principale */}
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
