"use client";

/**
 * Page d'accueil du dashboard
 * - Stats en temps réel
 * - Infos générales de l'établissement
 * - QR code d'inscription clients (cliquable pour agrandir)
 */

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Users, Stamp, Gift, MapPin, Phone, Store, QrCode, X, Pencil } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { apiClient } from "@/lib/api-client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

interface Stats {
  customers_total: number;
  stamps_today: number;
  rewards_this_month: number;
}

interface Business {
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  settings_json: {
    establishment_type?: string;
    address?: string;
    phone?: string;
  } | null;
  programs: Array<{ status: string; config_json: { threshold?: number; reward_label?: string } }>;
}

const ESTABLISHMENT_LABELS: Record<string, string> = {
  salon_coiffure:  "Salon de coiffure",
  barbier:         "Barbier",
  institut_beaute: "Institut de beauté",
  spa:             "Spa / Bien-être",
  onglerie:        "Onglerie / Nail art",
  restaurant:      "Restaurant",
  cafe:            "Café / Boulangerie",
  boutique:        "Boutique / Commerce",
  autre:           "Autre",
};

const PLAN_STYLES: Record<string, { label: string; className: string }> = {
  STARTER:  { label: "Starter",  className: "bg-gray-100 text-gray-600" },
  PRO:      { label: "Pro",      className: "bg-blue-100 text-blue-700" },
  BUSINESS: { label: "Business", className: "bg-violet-100 text-violet-700" },
};

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useSWR<Stats>(
    "/business/stats",
    (url: string) => apiClient.get(url),
    { refreshInterval: 30_000 }
  );

  const { data: business } = useSWR<Business>(
    "/business",
    (url: string) => apiClient.get(url)
  );

  const [qrExpanded, setQrExpanded] = useState(false);

  const registrationUrl = business?.slug ? `${APP_URL}/join/${business.slug}` : null;
  const activeProgram = business?.programs?.find((p) => p.status === "ACTIVE");
  const settings = business?.settings_json ?? {};

  return (
    <div className="space-y-6">

      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        {business?.name && (
          <p className="text-sm text-gray-400 mt-0.5">{business.name}</p>
        )}
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Clients enregistrés"  value={statsLoading ? null : (stats?.customers_total ?? 0)}  icon={Users}  color="blue"   />
        <StatCard label="Tampons aujourd'hui"  value={statsLoading ? null : (stats?.stamps_today ?? 0)}      icon={Stamp}  color="indigo" />
        <StatCard label="Récompenses ce mois"  value={statsLoading ? null : (stats?.rewards_this_month ?? 0)} icon={Gift}   color="green"  />
      </div>

      {/* Infos établissement + QR code */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Infos générales ── */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
            <Store className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900">Mon établissement</h2>
          </div>
          <div className="p-6">
            {business ? (
              <div className="flex items-start gap-4">

                {/* Logo — cliquable → page établissement (section apparence) */}
                <Link
                  href="/dashboard/business?scroll=section-appearance"
                  title="Modifier le logo"
                  className="shrink-0 relative group"
                >
                  {business.logo_url ? (
                    <img
                      src={business.logo_url}
                      alt="Logo"
                      className="w-16 h-16 rounded-xl object-cover border border-gray-200 group-hover:opacity-75 transition-opacity"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center group-hover:border-blue-400 group-hover:bg-blue-50 transition-colors">
                      <Store className="h-7 w-7 text-gray-300 group-hover:text-blue-400 transition-colors" />
                    </div>
                  )}
                  {/* Overlay icône crayon au survol */}
                  <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-black/40 rounded-xl absolute inset-0" />
                    <Pencil className="h-5 w-5 text-white relative z-10" />
                  </div>
                </Link>

                {/* Détails */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-base">{business.name}</p>
                    {business.plan && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PLAN_STYLES[business.plan]?.className ?? PLAN_STYLES.STARTER.className}`}>
                        {PLAN_STYLES[business.plan]?.label ?? business.plan}
                      </span>
                    )}
                  </div>

                  {settings.establishment_type && (
                    <p className="text-sm text-gray-500">
                      {ESTABLISHMENT_LABELS[settings.establishment_type] ?? settings.establishment_type}
                    </p>
                  )}

                  {settings.address && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{settings.address}</span>
                    </div>
                  )}

                  {settings.phone && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span>{settings.phone}</span>
                    </div>
                  )}

                  {activeProgram && (
                    <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        {activeProgram.config_json.threshold} tampons = {activeProgram.config_json.reward_label}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Skeleton */
              <div className="flex items-start gap-4 animate-pulse">
                <div className="w-16 h-16 rounded-xl bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── QR code d'inscription ── */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
            <QrCode className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900">QR code d'inscription</h2>
          </div>
          <div className="p-6 flex flex-col items-center gap-4">
            {registrationUrl ? (
              <>
                {/* QR cliquable — pleine largeur */}
                <button
                  onClick={() => setQrExpanded(true)}
                  title="Agrandir le QR code"
                  className="w-full flex flex-col items-center gap-3 p-5 border-2 border-dashed border-gray-200 rounded-2xl hover:border-blue-400 transition-colors group"
                >
                  <QRCodeSVG value={registrationUrl} size={160} className="w-full max-w-[200px]" />
                  <p className="text-xs text-gray-400 group-hover:text-blue-500 transition-colors">
                    Cliquer pour agrandir
                  </p>
                </button>

                {/* Instructions */}
                <div className="w-full space-y-1 text-center">
                  <p className="text-sm font-medium text-gray-900">Inscrivez vos clients</p>
                  <p className="text-xs text-gray-500">
                    Vos clients scannent ce code pour créer leur carte fidélité.
                  </p>
                  <a
                    href={registrationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-xs text-blue-600 hover:underline truncate max-w-full"
                  >
                    {registrationUrl}
                  </a>
                </div>
              </>
            ) : (
              /* Skeleton */
              <div className="flex items-center gap-6 w-full animate-pulse">
                <div className="w-28 h-28 bg-gray-100 rounded-2xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Activité récente */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Activité récente</h2>
        <p className="text-sm text-gray-400">
          Les transactions apparaîtront ici au fil des visites clients.
        </p>
      </div>

      {/* ── Modale QR aggrandi ── */}
      {qrExpanded && registrationUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
          onClick={() => setQrExpanded(false)}
        >
          <div
            className="bg-white rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-5 max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full">
              <p className="text-sm font-semibold text-gray-700">Scanner pour s'inscrire</p>
              <button
                onClick={() => setQrExpanded(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 border-2 border-dashed border-gray-200 rounded-2xl">
              <QRCodeSVG value={registrationUrl} size={220} />
            </div>

            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-gray-900">{business?.name}</p>
              <p className="text-xs text-gray-400 break-all">{registrationUrl}</p>
            </div>
          </div>
        </div>
      )}

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

function StatCard({ label, value, icon: Icon, color }: {
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
