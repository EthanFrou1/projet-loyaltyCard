"use client";

/**
 * Page d'inscription client — accessible publiquement depuis le QR code du commerce.
 *
 * Flux :
 *   1. Le commerçant affiche un QR code pointant vers /join/[slug]
 *   2. Le client scanne → arrive sur cette page
 *   3. Il remplit prénom, nom, email (+ téléphone optionnel)
 *   4. Sa carte est créée → redirigé vers /welcome/[id]
 *
 * Pas d'authentification requise.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BusinessInfo {
  name: string;
  logo_url: string | null;
  slug: string;
  threshold: number;
  reward_label: string;
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function JoinPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Formulaire
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Charger les infos du commerce
  useEffect(() => {
    fetch(`${API_URL}/api/v1/join/${slug}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: BusinessInfo) => setBusiness(data))
      .catch(() => setNotFound(true));
  }, [slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/v1/join/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name:  lastName.trim(),
          email:      email.trim(),
          ...(phone.trim() && { phone: phone.trim() }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "Une erreur est survenue.");
        return;
      }

      // Rediriger vers la page de bienvenue avec les infos du business
      router.push(`/welcome/${data.id}?slug=${slug}&new=${!data.already_registered}`);
    } catch {
      setError("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  // ─── États de chargement / erreur ─────────────────────────────────────────

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <p className="text-4xl mb-4">🔍</p>
          <h1 className="text-xl font-bold text-gray-900">Établissement introuvable</h1>
          <p className="text-sm text-gray-500 mt-2">
            Ce lien n'est pas valide. Demandez le QR code à votre commerçant.
          </p>
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Formulaire d'inscription ──────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* En-tête commerce */}
        <div className="text-center space-y-3">
          {business.logo_url ? (
            <img
              src={business.logo_url}
              alt={business.name}
              className="w-20 h-20 rounded-2xl object-cover mx-auto shadow-sm"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto text-3xl">
              🏪
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900">{business.name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              Créez votre carte fidélité gratuite
            </p>
          </div>

          {/* Aperçu de la récompense */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
            <span className="font-semibold">{business.threshold} tampons</span> =&nbsp;
            <span>{business.reward_label}</span> 🎁
          </div>
        </div>

        {/* Formulaire */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Prénom *</label>
                <input
                  type="text"
                  required
                  placeholder="Marie"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputClass}
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nom *</label>
                <input
                  type="text"
                  required
                  placeholder="Dupont"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={inputClass}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                required
                placeholder="marie@exemple.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                autoComplete="email"
              />
              <p className="text-xs text-gray-400 mt-1">
                Pour retrouver votre carte si vous changez de téléphone.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Téléphone <span className="text-gray-400 font-normal">(optionnel)</span>
              </label>
              <input
                type="tel"
                placeholder="06 12 34 56 78"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                autoComplete="tel"
              />
            </div>

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
            >
              {loading ? "Création de votre carte…" : "Obtenir ma carte fidélité →"}
            </button>
          </form>

          <p className="text-xs text-center text-gray-400">
            Vos données sont utilisées uniquement par {business.name}.
            <br />Aucun spam, aucune revente.
          </p>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
