"use client";

/**
 * Page d'accueil du dashboard
 * Affiche les stats en temps réel : clients, tampons du jour, récompenses ce mois.
 */

import useSWR from "swr";
import { Users, Stamp, Gift } from "lucide-react";
import { apiClient } from "@/lib/api-client";

interface Stats {
  customers_total: number;
  stamps_today: number;
  rewards_this_month: number;
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useSWR<Stats>(
    "/business/stats",
    (url: string) => apiClient.get(url),
    { refreshInterval: 30_000 } // rafraîchit toutes les 30s
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>

      {/* Stats rapides */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard
          label="Clients enregistrés"
          value={isLoading ? null : (stats?.customers_total ?? 0)}
          icon={Users}
          color="blue"
        />
        <StatCard
          label="Tampons aujourd'hui"
          value={isLoading ? null : (stats?.stamps_today ?? 0)}
          icon={Stamp}
          color="indigo"
        />
        <StatCard
          label="Récompenses ce mois"
          value={isLoading ? null : (stats?.rewards_this_month ?? 0)}
          icon={Gift}
          color="green"
        />
      </div>

      {/* Activité récente */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Activité récente</h2>
        <p className="text-sm text-gray-400">
          Les transactions apparaîtront ici au fil des visites clients.
        </p>
      </div>
    </div>
  );
}

// ─── Composant carte stat ─────────────────────────────────────────────────────

type Color = "blue" | "indigo" | "green";

const colorMap: Record<Color, { bg: string; icon: string }> = {
  blue:   { bg: "bg-blue-50",   icon: "text-blue-600"   },
  indigo: { bg: "bg-indigo-50", icon: "text-indigo-600" },
  green:  { bg: "bg-green-50",  icon: "text-green-600"  },
};

function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string;
  value: number | null;
  icon: React.ElementType;
  color: Color;
}) {
  const c = colorMap[color];
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm flex items-center gap-4">
      <div className={`p-3 rounded-xl ${c.bg}`}>
        <Icon className={`h-6 w-6 ${c.icon}`} />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        {value === null ? (
          <div className="h-8 w-16 bg-gray-100 rounded animate-pulse mt-1" />
        ) : (
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        )}
      </div>
    </div>
  );
}
