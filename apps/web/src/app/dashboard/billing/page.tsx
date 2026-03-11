"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Crown, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { apiClient, ApiClientError } from "@/lib/api-client";

type PlanId = "STARTER" | "PRO" | "BUSINESS";

interface PlanConfig {
  id: PlanId;
  name: string;
  price: number;
  icon: LucideIcon;
  iconColor: string;
  borderColor: string;
  badgeColor: string;
  description: string;
  target: string;
  features: string[];
  highlighted: boolean;
}

interface BillingStatus {
  stripe_ready: boolean;
  current_plan: PlanId;
  subscription_status: string | null;
  current_period_end: string | null;
  has_customer: boolean;
  has_subscription: boolean;
}

const plans: PlanConfig[] = [
  {
    id: "STARTER",
    name: "Starter",
    price: 19,
    icon: Zap,
    iconColor: "text-slate-500",
    borderColor: "border-slate-200",
    badgeColor: "bg-slate-100 text-slate-700",
    description: "Pour lancer votre première carte de fidélité simplement.",
    target: "Idéal pour un commerce qui démarre",
    highlighted: false,
    features: [
      "2 programmes fidélité actifs",
      "Clients illimités",
      "20 générations IA / mois",
      "Apple Wallet + Google Wallet",
      "QR code d'inscription",
      "Dashboard analytics",
    ],
  },
  {
    id: "PRO",
    name: "Pro",
    price: 39,
    icon: Sparkles,
    iconColor: "text-emerald-600",
    borderColor: "border-emerald-300",
    badgeColor: "bg-emerald-100 text-emerald-700",
    description: "Le meilleur équilibre pour gérer plusieurs offres fidélité.",
    target: "Idéal pour les établissements qui accélèrent",
    highlighted: true,
    features: [
      "5 programmes fidélité actifs",
      "Clients illimités",
      "100 générations IA / mois",
      "Apple Wallet + Google Wallet",
      "QR code d'inscription",
      "Dashboard analytics avancé",
      "Export CSV clients",
    ],
  },
  {
    id: "BUSINESS",
    name: "Business",
    price: 69,
    icon: Crown,
    iconColor: "text-amber-500",
    borderColor: "border-amber-200",
    badgeColor: "bg-amber-100 text-amber-700",
    description: "Pour piloter une activité plus dense avec plus de marge de manœuvre.",
    target: "Idéal pour les structures les plus actives",
    highlighted: false,
    features: [
      "Jusqu'à 5 programmes fidélité actifs",
      "Clients illimités",
      "300 générations IA / mois",
      "Apple Wallet + Google Wallet",
      "QR code d'inscription",
      "Dashboard analytics avancé",
      "Export CSV clients",
      "Accès API (bientôt)",
      "Multi-établissements (bientôt)",
    ],
  },
];

const fallbackPlan = plans[0]!;

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingPlan, setPendingPlan] = useState<PlanId | "portal" | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    const stripeState = searchParams.get("stripe");
    if (stripeState === "success") {
      setMessage({ type: "success", text: "Le paiement Stripe a été validé. La mise à jour du plan arrive via webhook." });
    }
    if (stripeState === "cancel") {
      setMessage({ type: "error", text: "Le paiement Stripe a été annulé." });
    }
  }, [searchParams]);

  async function loadStatus() {
    setLoading(true);
    try {
      const data = await apiClient.get<BillingStatus>("/stripe/status");
      setStatus(data);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Impossible de charger la facturation.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout(plan: PlanId) {
    setPendingPlan(plan);
    setMessage(null);
    try {
      const data = await apiClient.post<{ url: string }>("/stripe/checkout", { plan });
      window.location.href = data.url;
    } catch (err) {
      const text =
        err instanceof ApiClientError
          ? err.message
          : "Impossible de démarrer le paiement Stripe.";
      setMessage({ type: "error", text });
      setPendingPlan(null);
    }
  }

  async function handlePortal(targetPlan?: PlanId) {
    setPendingPlan(targetPlan ?? "portal");
    setMessage(null);
    try {
      const data = await apiClient.post<{ url: string }>("/stripe/portal", targetPlan ? { plan: targetPlan } : {});
      window.location.href = data.url;
    } catch (err) {
      const text =
        err instanceof ApiClientError
          ? err.message
          : "Impossible d'ouvrir le portail Stripe.";
      setMessage({ type: "error", text });
      setPendingPlan(null);
    }
  }

  const currentPlan = status?.current_plan ?? "STARTER";
  const currentPlanConfig = useMemo(
    () => plans.find((plan) => plan.id === currentPlan) ?? fallbackPlan,
    [currentPlan],
  );
  const visiblePlans = useMemo(
    () => plans.filter((plan) => plan.id !== "BUSINESS"),
    [],
  );
  const CurrentPlanIcon = currentPlanConfig.icon;

  const billingNote = status?.current_period_end
    ? `Période en cours jusqu'au ${new Date(status.current_period_end).toLocaleDateString("fr-FR")}.`
    : status?.has_subscription || status?.subscription_status
    ? `Abonnement Stripe ${status.subscription_status ?? "actif"} synchronisé.`
    : "Aucun abonnement Stripe actif pour le moment.";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/50 to-slate-50 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              Stripe
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Abonnement</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Gérez votre offre directement depuis Stripe en mode test depuis votre environnement local.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm lg:max-w-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Plan actif</p>
            <div className="mt-2 flex items-center gap-3">
              <div className={`rounded-2xl p-3 ${currentPlanConfig.badgeColor}`}>
                <CurrentPlanIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-900">{currentPlanConfig.name}</p>
                <p className="text-sm text-slate-500">{status?.subscription_status ?? "Aucun abonnement Stripe"}</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">{billingNote}</p>
          </div>
        </div>
      </section>

      {message && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {!loading && status && !status.stripe_ready && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Stripe n'est pas encore configuré côté serveur. Il faudra ajouter les clés et les `price_id` dans `.env`.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {visiblePlans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const Icon = plan.icon;
          const canUseStripe = Boolean(status?.stripe_ready);
          const hasSubscription = Boolean(status?.has_subscription);
          const isUpgrade = plan.price > currentPlanConfig.price;

          let ctaLabel = "Choisir cette offre";
          let ctaAction = () => handleCheckout(plan.id);
          let ctaDisabled = !canUseStripe || pendingPlan !== null;

          if (isCurrent) {
            ctaLabel = "Voir plan actuel";
            ctaAction = async () => {};
            ctaDisabled = true;
          } else if (hasSubscription) {
            ctaLabel =
              pendingPlan === plan.id
                ? "Ouverture..."
                : isUpgrade
                ? "Passer au plan supérieur"
                : `Passer au plan ${plan.name}`;
            ctaAction = () => handlePortal(plan.id);
            ctaDisabled = !canUseStripe || pendingPlan !== null;
          } else if (pendingPlan === plan.id) {
            ctaLabel = "Redirection...";
          }

          return (
            <article
              key={plan.id}
              className={`relative flex h-full flex-col rounded-3xl border bg-white p-6 shadow-sm transition-shadow ${
                plan.highlighted ? "shadow-lg shadow-emerald-100/60" : ""
              } ${plan.borderColor}`}
            >
              <div className="absolute right-5 top-5">
                {isCurrent ? (
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${plan.badgeColor}`}>
                    Plan actuel
                  </span>
                ) : plan.highlighted ? (
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                    Recommandé
                  </span>
                ) : null}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`rounded-2xl p-3 ${plan.badgeColor}`}>
                    <Icon className={`h-5 w-5 ${plan.iconColor}`} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{plan.name}</h2>
                    <p className="text-sm text-slate-500">{plan.target}</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-extrabold tracking-tight text-slate-900">{plan.price}€</span>
                    <span className="pb-1 text-sm text-slate-400">/mois</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{plan.description}</p>
                </div>
              </div>

              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-slate-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={ctaAction}
                  disabled={ctaDisabled}
                  className={`w-full rounded-2xl px-4 py-3 text-center text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    isCurrent
                      ? "border border-slate-200 bg-slate-100 text-slate-500"
                      : "bg-emerald-500 text-white hover:bg-emerald-600"
                  }`}
                >
                  {ctaLabel}
                </button>

                <p className="text-xs leading-5 text-slate-500">
                  {hasSubscription
                    ? "Les changements de plan et la facturation se gèrent dans Stripe."
                    : "Le premier abonnement se lance via Stripe Checkout en mode test."}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Comparatif détaillé</h3>
            <p className="mt-1 text-sm text-slate-500">
              De quoi choisir le bon niveau avant de lancer le checkout.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Le plan <span className="font-semibold text-slate-900">Pro</span> reste le meilleur compromis pour
            plusieurs programmes actifs.
          </div>
        </div>

        <div className="mt-4 sm:hidden">
          <div className="overflow-hidden rounded-2xl border border-slate-100">
            <div className="grid grid-cols-[1.4fr_repeat(2,minmax(0,0.9fr))] border-b border-slate-100 bg-slate-50 text-xs font-semibold">
              <div className="px-2 py-3 text-slate-500">Fonction</div>
              <div className="px-1 py-3 text-center text-slate-700">Starter</div>
              <div className="px-1 py-3 text-center text-emerald-700">Pro</div>
            </div>

            {[
              { label: "Programmes", starter: "2", pro: "5" },
              { label: "IA / mois", starter: "20", pro: "100" },
              { label: "Apple", starter: "Oui", pro: "Oui" },
              { label: "Google", starter: "Oui", pro: "Oui" },
              { label: "CSV", starter: "-", pro: "Oui" },
            ].map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[1.4fr_repeat(2,minmax(0,0.9fr))] border-b border-slate-100 text-xs leading-5 last:border-b-0"
              >
                <div className="px-2 py-3 font-medium text-slate-600">{row.label}</div>
                <div className="px-1 py-3 text-center text-slate-600">{row.starter}</div>
                <div className="px-1 py-3 text-center font-semibold text-emerald-700">{row.pro}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left font-medium text-slate-500">Fonctionnalité</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Starter</th>
                <th className="px-4 py-3 text-center font-semibold text-emerald-700">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                { label: "Programmes actifs", starter: "2", pro: "5" },
                { label: "Générations IA / mois", starter: "20", pro: "100" },
                { label: "Apple Wallet", starter: "Oui", pro: "Oui" },
                { label: "Google Wallet", starter: "Oui", pro: "Oui" },
                { label: "Export CSV", starter: "-", pro: "Oui" },
              ].map((row) => (
                <tr key={row.label} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">{row.label}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{row.starter}</td>
                  <td className="px-4 py-3 text-center font-medium text-emerald-700">{row.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

