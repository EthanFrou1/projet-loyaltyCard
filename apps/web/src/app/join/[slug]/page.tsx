"use client";

/**
 * Public join page scanned from business QR.
 * Supports selecting a loyalty program when multiple are active.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface JoinProgram {
  id: string;
  name: string;
  type: "STAMPS" | "POINTS";
  threshold: number;
  reward_label: string;
}

interface BusinessInfo {
  name: string;
  logo_url: string | null;
  slug: string;
  threshold: number;
  reward_label: string;
  default_program_id: string | null;
  programs: JoinProgram[];
}

export default function JoinPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const presetProgramId = searchParams.get("programId") ?? searchParams.get("program_id");

  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/join/${slug}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: BusinessInfo) => {
        setBusiness(data);
        const ids = new Set((data.programs ?? []).map((p) => p.id));
        if (presetProgramId && ids.has(presetProgramId)) {
          setSelectedProgramId(presetProgramId);
          return;
        }
        setSelectedProgramId(data.default_program_id ?? data.programs?.[0]?.id ?? null);
      })
      .catch(() => setNotFound(true));
  }, [slug, presetProgramId]);

  const selectedProgram = useMemo(() => {
    if (!business || !selectedProgramId) return null;
    return business.programs.find((p) => p.id === selectedProgramId) ?? null;
  }, [business, selectedProgramId]);

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
          last_name: lastName.trim(),
          email: email.trim(),
          ...(phone.trim() && { phone: phone.trim() }),
          ...(selectedProgramId && { program_id: selectedProgramId }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "Une erreur est survenue.");
        return;
      }

      router.push(`/welcome/${data.id}?slug=${slug}&new=${!data.already_registered}`);
    } catch {
      setError("Impossible de contacter le serveur. Reessayez.");
    } finally {
      setLoading(false);
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <p className="text-4xl mb-4">Search</p>
          <h1 className="text-xl font-bold text-gray-900">Etablissement introuvable</h1>
          <p className="text-sm text-gray-500 mt-2">
            Ce lien n'est pas valide. Demandez le QR code a votre commercant.
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          {business.logo_url ? (
            <img
              src={business.logo_url}
              alt={business.name}
              className="w-20 h-20 rounded-2xl object-cover mx-auto shadow-sm"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto text-3xl">
              Shop
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900">{business.name}</h1>
            <p className="text-sm text-gray-500 mt-1">Creez votre carte fidelite gratuite</p>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
            <span className="font-semibold">{selectedProgram?.threshold ?? business.threshold} tampons</span>
            <span> = </span>
            <span>{selectedProgram?.reward_label ?? business.reward_label}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {(business.programs?.length ?? 0) > 1 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Programme de fidelite *</label>
                <select
                  value={selectedProgramId ?? ""}
                  onChange={(e) => setSelectedProgramId(e.target.value || null)}
                  className={inputClass}
                  required
                >
                  {business.programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - {p.threshold} tampons = {p.reward_label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Prenom *</label>
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
                Pour retrouver votre carte si vous changez de telephone.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Telephone <span className="text-gray-400 font-normal">(optionnel)</span>
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
              {loading ? "Creation de votre carte..." : "Obtenir ma carte fidelite ->"}
            </button>
          </form>

          <p className="text-xs text-center text-gray-400">
            Vos donnees sont utilisees uniquement par {business.name}.
            <br />Aucun spam, aucune revente.
          </p>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
