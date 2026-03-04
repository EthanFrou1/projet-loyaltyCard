/**
 * Page Outils IA
 *
 * Permet au commerçant de :
 *   1. Nettoyer son logo (fond transparent, upscale)
 *   2. Générer 3 designs de carte fidélité
 *   3. Générer des assets promo (story IG, affiche A4, coupon)
 *
 * Affiche le quota consommé ce mois.
 * Les jobs sont asynchrones : l'interface poll GET /ai/jobs/:id jusqu'à DONE.
 */
"use client";

import { useState } from "react";
import useSWR from "swr";
import { Sparkles, Upload } from "lucide-react";
import { apiClient } from "@/lib/api-client";

interface UsageData {
  used: number;
  limit: number;
  plan: string;
  month: string;
}

interface JobResult {
  id: string;
  status: string;
  assets: Array<{ kind: string; url: string }>;
}

interface JobCreatedResponse {
  job_id: string;
}

export default function AiPage() {
  const { data: usage } = useSWR<UsageData>("/ai/usage", (url: string) => apiClient.get<UsageData>(url));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Outils IA</h1>
        {usage && (
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {usage.used} / {usage.limit} générations ce mois
          </span>
        )}
      </div>

      {/* Nettoyage logo */}
      <AiCard
        title="Nettoyer le logo"
        description="Supprime le fond, améliore la qualité, prépare le logo pour la carte fidélité."
        icon={<Upload className="h-5 w-5" />}
      >
        <CleanLogoForm />
      </AiCard>

      {/* Générer design de carte */}
      <AiCard
        title="Générer un design de carte"
        description="Décris le style de ton salon, l'IA génère 3 variantes de design."
        icon={<Sparkles className="h-5 w-5" />}
      >
        <GeneratePassDesignForm />
      </AiCard>

      {/* Assets promo */}
      <AiCard
        title="Assets promotionnels"
        description="Story Instagram, affiche A4 avec QR, coupon — prêts à l'emploi."
        icon={<Sparkles className="h-5 w-5" />}
      >
        <GeneratePromoForm />
      </AiCard>
    </div>
  );
}

// ─── Composants de formulaire ─────────────────────────────────────────────────

function CleanLogoForm() {
  const [url, setUrl] = useState("");
  const [job, setJob] = useState<JobResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiClient.post<JobCreatedResponse>("/ai/clean-logo", { source_url: url });
      setJob({ id: res.job_id, status: "PENDING", assets: [] });
      pollJob(res.job_id, setJob);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="url"
        placeholder="URL du logo à nettoyer"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
        className="w-full border rounded-lg px-3 py-2 text-sm"
      />
      <SubmitButton loading={loading} label="Nettoyer le logo" />
      <JobStatus job={job} />
    </form>
  );
}

function GeneratePassDesignForm() {
  const [prompt, setPrompt] = useState("");
  const [job, setJob] = useState<JobResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiClient.post<JobCreatedResponse>("/ai/generate-pass-design", {
        style_prompt: prompt,
        variants: 3,
      });
      setJob({ id: res.job_id, status: "PENDING", assets: [] });
      pollJob(res.job_id, setJob);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <textarea
        placeholder="Ex: barber premium urbain, couleurs sombres, style luxe minimaliste"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        required
        rows={3}
        className="w-full border rounded-lg px-3 py-2 text-sm"
      />
      <SubmitButton loading={loading} label="Générer 3 designs" />
      <JobStatus job={job} />
    </form>
  );
}

function GeneratePromoForm() {
  const [text, setText] = useState("");
  const [job, setJob] = useState<JobResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiClient.post<JobCreatedResponse>("/ai/generate-promo-assets", {
        promo_text: text,
        assets: ["story_ig", "poster_a4", "coupon"],
      });
      setJob({ id: res.job_id, status: "PENDING", assets: [] });
      pollJob(res.job_id, setJob);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="text"
        placeholder="Ex: 10 tampons = 10€ offerts — Présentez votre carte !"
        value={text}
        onChange={(e) => setText(e.target.value)}
        required
        className="w-full border rounded-lg px-3 py-2 text-sm"
      />
      <SubmitButton loading={loading} label="Générer story + affiche + coupon" />
      <JobStatus job={job} />
    </form>
  );
}

// ─── Composants utilitaires ───────────────────────────────────────────────────

function AiCard({ title, description, icon, children }: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-brand-50 rounded-lg text-brand-600">{icon}</div>
        <div>
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
    >
      {loading ? "En cours…" : label}
    </button>
  );
}

function JobStatus({ job }: { job: JobResult | null }) {
  if (!job) return null;

  return (
    <div className="text-sm text-gray-500">
      {job.status === "PENDING" || job.status === "PROCESSING" ? (
        <p>⏳ Génération en cours…</p>
      ) : job.status === "DONE" ? (
        <div className="space-y-2">
          <p className="text-green-600 font-medium">✓ Terminé !</p>
          <div className="grid grid-cols-3 gap-2">
            {job.assets.map((a) => (
              <a key={a.kind} href={a.url} target="_blank" rel="noreferrer">
                <img src={a.url} alt={a.kind} className="rounded-lg border w-full aspect-square object-cover" />
              </a>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-red-500">Échec de la génération</p>
      )}
    </div>
  );
}

/**
 * Poll l'API toutes les 2 secondes jusqu'à ce que le job soit terminé.
 */
function pollJob(jobId: string, setJob: (j: JobResult) => void) {
  const interval = setInterval(async () => {
    try {
      const data = await apiClient.get<JobResult>(`/ai/jobs/${jobId}`);
      setJob(data);
      if (data.status === "DONE" || data.status === "FAILED") {
        clearInterval(interval);
      }
    } catch {
      clearInterval(interval);
    }
  }, 2000);
}
