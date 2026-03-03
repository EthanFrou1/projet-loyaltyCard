"use client";

/**
 * Page Abonnement — tarification visuelle.
 *
 * Affiche les 3 plans (Starter, Pro, Business) avec leurs fonctionnalités.
 * Le plan actuel est mis en évidence. Les boutons d'upgrade sont désactivés
 * (Stripe non encore intégré).
 */

import { useEffect, useState } from "react";
import { Check, Zap, Crown, Sparkles } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type PlanId = "STARTER" | "PRO" | "BUSINESS";

interface PlanConfig {
  id: PlanId;
  name: string;
  price: number;
  icon: React.ElementType;
  iconColor: string;
  borderColor: string;
  badgeColor: string;
  features: string[];
  highlighted: boolean;
}

const plans: PlanConfig[] = [
  {
    id: "STARTER",
    name: "Starter",
    price: 19,
    icon: Zap,
    iconColor: "text-gray-600",
    borderColor: "border-gray-200",
    badgeColor: "bg-gray-100 text-gray-700",
    highlighted: false,
    features: [
      "1 programme fidélité actif",
      "Clients illimités",
      "20 générations IA / mois",
      "Apple Wallet",
      "QR code d'inscription",
      "Dashboard analytics",
    ],
  },
  {
    id: "PRO",
    name: "Pro",
    price: 39,
    icon: Sparkles,
    iconColor: "text-blue-600",
    borderColor: "border-blue-500",
    badgeColor: "bg-blue-600 text-white",
    highlighted: true,
    features: [
      "3 programmes fidélité actifs",
      "Clients illimités",
      "100 générations IA / mois",
      "Apple Wallet + Google Wallet",
      "QR code d'inscription",
      "Dashboard analytics avancé",
      "Export CSV clients",
      "Support prioritaire",
    ],
  },
  {
    id: "BUSINESS",
    name: "Business",
    price: 69,
    icon: Crown,
    iconColor: "text-violet-600",
    borderColor: "border-violet-300",
    badgeColor: "bg-violet-100 text-violet-700",
    highlighted: false,
    features: [
      "Programmes fidélité illimités",
      "Clients illimités",
      "300 générations IA / mois",
      "Apple Wallet + Google Wallet",
      "QR code d'inscription",
      "Dashboard analytics avancé",
      "Export CSV clients",
      "Support prioritaire dédié",
      "Accès API (bientôt)",
      "Multi-établissements (bientôt)",
    ],
  },
];

export default function BillingPage() {
  const [currentPlan, setCurrentPlan] = useState<PlanId>("STARTER");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    fetch(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.business?.plan) setCurrentPlan(data.business.plan as PlanId);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-8">

      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Abonnement</h1>
        <p className="mt-1 text-sm text-gray-500">
          Choisissez le plan qui correspond à votre activité.
        </p>
      </div>

      {/* Cartes de tarification */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {plans.map((plan) => {
          const Icon = plan.icon;
          const isCurrent = plan.id === currentPlan;

          return (
            <div
              key={plan.id}
              className={`relative bg-white rounded-2xl border-2 p-6 flex flex-col gap-5 transition-shadow ${
                plan.highlighted
                  ? `${plan.borderColor} shadow-lg`
                  : `${plan.borderColor} shadow-sm`
              }`}
            >
              {/* Badge "Populaire" pour Pro */}
              {plan.highlighted && !isCurrent && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Le plus populaire
                  </span>
                </div>
              )}

              {/* Badge "Votre plan" si plan actuel */}
              {isCurrent && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${plan.badgeColor}`}>
                    Votre plan actuel
                  </span>
                </div>
              )}

              {/* En-tête du plan */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${plan.iconColor}`} />
                  <h2 className="text-lg font-bold text-gray-900">{plan.name}</h2>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-gray-900">{plan.price}€</span>
                  <span className="text-sm text-gray-400">/mois</span>
                </div>
              </div>

              {/* Liste des fonctionnalités */}
              <ul className="space-y-2.5 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

              {/* Bouton CTA */}
              <div>
                {isCurrent ? (
                  <div className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-center ${plan.badgeColor}`}>
                    Plan actuel
                  </div>
                ) : (
                  <button
                    disabled
                    title="Stripe bientôt disponible"
                    className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold border-2 border-gray-200 text-gray-400 cursor-not-allowed"
                  >
                    Passer à {plan.name} — Bientôt disponible
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Note sur Stripe */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Paiements bientôt disponibles.</strong> L'intégration Stripe est en cours de développement.
        Votre plan actuel est gratuit pendant la période de beta. Vous serez notifié avant tout changement.
      </div>

      {/* Tableau comparatif */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Comparatif détaillé</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Fonctionnalité</th>
                <th className="text-center px-4 py-3 text-gray-700 font-semibold">Starter</th>
                <th className="text-center px-4 py-3 text-blue-700 font-semibold">Pro</th>
                <th className="text-center px-4 py-3 text-violet-700 font-semibold">Business</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[
                { label: "Programmes actifs",      starter: "1",    pro: "3",      business: "Illimité" },
                { label: "Générations IA / mois",  starter: "20",   pro: "100",    business: "300"      },
                { label: "Apple Wallet",            starter: "✓",    pro: "✓",      business: "✓"        },
                { label: "Google Wallet",           starter: "—",    pro: "✓",      business: "✓"        },
                { label: "Export CSV",             starter: "—",    pro: "✓",      business: "✓"        },
                { label: "Support prioritaire",    starter: "—",    pro: "✓",      business: "✓ Dédié"  },
                { label: "Accès API",              starter: "—",    pro: "—",      business: "Bientôt"  },
                { label: "Multi-établissements",   starter: "—",    pro: "—",      business: "Bientôt"  },
              ].map((row) => (
                <tr key={row.label} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-700">{row.label}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{row.starter}</td>
                  <td className="px-4 py-3 text-center text-blue-600 font-medium">{row.pro}</td>
                  <td className="px-4 py-3 text-center text-violet-600 font-medium">{row.business}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
