/**
 * Page Outils IA
 *
 * Permet au commerçant de :
 *   1. Uploader son logo puis le nettoyer (fond transparent) via gpt-image-1
 *   2. Générer 3 designs de carte fidélité
 *   3. Générer des assets promo (story IG, affiche A4, coupon)
 *
 * Affiche le quota consommé ce mois et l'historique des 20 derniers jobs.
 * Les jobs sont asynchrones : l'interface poll GET /ai/jobs/:id jusqu'à DONE.
 */
"use client";

import { useState, useRef } from "react";
import useSWR, { mutate } from "swr";
import { Sparkles, Upload, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UsageData {
  used: number;
  limit: number;
  plan: string;
  month: string;
}

interface JobResult {
  id: string;
  type: string;
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  assets: Array<{ kind: string; url: string }>;
  error_message?: string | null;
  created_at: string;
}

interface JobCreatedResponse {
  job_id: string;
}

interface UploadLogoResponse {
  url: string;
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function AiPage() {
  const { data: usage } = useSWR<UsageData>("/ai/usage", (url: string) =>
    apiClient.get<UsageData>(url)
  );
  const { data: jobs, mutate: refreshJobs } = useSWR<JobResult[]>("/ai/jobs", (url: string) =>
    apiClient.get<JobResult[]>(url)
  );

  function onJobStarted() {
    refreshJobs();
  }

  const percentUsed = usage ? Math.round((usage.used / usage.limit) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* En-tête + quota */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Outils IA</h1>
        {usage && (
          <div className="text-right">
            <div className="text-sm text-gray-500">
              {usage.used} / {usage.limit} générations ce mois
            </div>
            <div className="mt-1 h-1.5 w-32 rounded-full bg-gray-200">
              <div
                className="h-1.5 rounded-full bg-brand-600 transition-all"
                style={{ width: `${Math.min(percentUsed, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Outils */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AiCard
          title="Nettoyer le logo"
          description="Uploadez votre logo — l'IA supprime le fond et le prépare pour la carte fidélité."
          icon={<Upload className="h-5 w-5" />}
        >
          <CleanLogoForm onJobStarted={onJobStarted} />
        </AiCard>

        <AiCard
          title="Générer un design de carte"
          description="Décris le style de ton salon, l'IA génère 3 variantes de design."
          icon={<Sparkles className="h-5 w-5" />}
        >
          <GeneratePassDesignForm onJobStarted={onJobStarted} />
        </AiCard>

        <AiCard
          title="Assets promotionnels"
          description="Story Instagram, affiche A4 avec QR, coupon — prêts à l'emploi."
          icon={<Sparkles className="h-5 w-5" />}
        >
          <GeneratePromoForm onJobStarted={onJobStarted} />
        </AiCard>
      </div>

      {/* Historique des jobs */}
      {jobs && jobs.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Historique des générations</h2>
          <div className="space-y-3">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onRefresh={refreshJobs} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Formulaires ──────────────────────────────────────────────────────────────

function CleanLogoForm({ onJobStarted }: { onJobStarted: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [job, setJob] = useState<JobResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
    setJob(null);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      // 1. Upload du fichier sur R2
      const form = new FormData();
      form.append("file", file);
      const { url } = await apiClient.postForm<UploadLogoResponse>("/ai/upload-logo", form);

      // 2. Lancer le job de nettoyage avec l'URL R2
      const res = await apiClient.post<JobCreatedResponse>("/ai/clean-logo", { source_url: url });
      const newJob: JobResult = {
        id: res.job_id,
        type: "CLEAN_LOGO",
        status: "PENDING",
        assets: [],
        created_at: new Date().toISOString(),
      };
      setJob(newJob);
      onJobStarted();
      pollJob(res.job_id, setJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {/* Zone de sélection fichier */}
      <div
        className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-brand-400 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          <img src={preview} alt="Logo sélectionné" className="mx-auto h-20 object-contain" />
        ) : (
          <div className="text-sm text-gray-400">
            <Upload className="mx-auto h-6 w-6 mb-1" />
            Cliquez pour sélectionner un logo (PNG, JPEG, WEBP)
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={onFileChange}
          className="hidden"
        />
      </div>
      {file && <p className="text-xs text-gray-400">{file.name}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <SubmitButton loading={loading} disabled={!file} label="Nettoyer le logo" />
      {job && <InlineJobStatus job={job} />}
    </form>
  );
}

function GeneratePassDesignForm({ onJobStarted }: { onJobStarted: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [job, setJob] = useState<JobResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<JobCreatedResponse>("/ai/generate-pass-design", {
        style_prompt: prompt,
        variants: 3,
      });
      const newJob: JobResult = {
        id: res.job_id,
        type: "GENERATE_PASS_DESIGN",
        status: "PENDING",
        assets: [],
        created_at: new Date().toISOString(),
      };
      setJob(newJob);
      onJobStarted();
      pollJob(res.job_id, setJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
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
      {error && <p className="text-xs text-red-500">{error}</p>}
      <SubmitButton loading={loading} disabled={false} label="Générer 3 designs" />
      {job && <InlineJobStatus job={job} />}
    </form>
  );
}

function GeneratePromoForm({ onJobStarted }: { onJobStarted: () => void }) {
  const [text, setText] = useState("");
  const [job, setJob] = useState<JobResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<JobCreatedResponse>("/ai/generate-promo-assets", {
        promo_text: text,
        assets: ["story_ig", "poster_a4", "coupon"],
      });
      const newJob: JobResult = {
        id: res.job_id,
        type: "GENERATE_PROMO_ASSETS",
        status: "PENDING",
        assets: [],
        created_at: new Date().toISOString(),
      };
      setJob(newJob);
      onJobStarted();
      pollJob(res.job_id, setJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
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
      {error && <p className="text-xs text-red-500">{error}</p>}
      <SubmitButton loading={loading} disabled={false} label="Générer story + affiche + coupon" />
      {job && <InlineJobStatus job={job} />}
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

function SubmitButton({ loading, disabled, label }: {
  loading: boolean;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {loading ? "En cours…" : label}
    </button>
  );
}

// Statut inline sous le formulaire pendant le poll
function InlineJobStatus({ job }: { job: JobResult }) {
  if (job.status === "PENDING" || job.status === "PROCESSING") {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Génération en cours…
      </div>
    );
  }
  if (job.status === "FAILED") {
    return <p className="text-sm text-red-500">Échec : {job.error_message ?? "erreur inconnue"}</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-green-600 flex items-center gap-1">
        <CheckCircle className="h-4 w-4" /> Terminé !
      </p>
      <AssetGrid assets={job.assets} />
    </div>
  );
}

// Ligne dans l'historique
function JobRow({ job, onRefresh }: { job: JobResult; onRefresh: () => void }) {
  const [polling, setPolling] = useState(false);

  function retry() {
    if (polling) return;
    setPolling(true);
    pollJobCallback(job.id, onRefresh, () => setPolling(false));
  }

  const labels: Record<string, string> = {
    CLEAN_LOGO: "Nettoyage logo",
    GENERATE_PASS_DESIGN: "Design de carte",
    GENERATE_PROMO_ASSETS: "Assets promo",
  };

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon status={job.status} />
          <span className="text-sm font-medium text-gray-700">{labels[job.type] ?? job.type}</span>
        </div>
        <span className="text-xs text-gray-400">
          {new Date(job.created_at).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      {job.status === "DONE" && job.assets.length > 0 && <AssetGrid assets={job.assets} />}
      {job.status === "FAILED" && (
        <p className="text-xs text-red-500">{job.error_message ?? "Erreur inconnue"}</p>
      )}
      {(job.status === "PENDING" || job.status === "PROCESSING") && !polling && (
        <button onClick={retry} className="text-xs text-brand-600 underline">
          Actualiser
        </button>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: JobResult["status"] }) {
  if (status === "DONE") return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === "FAILED") return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "PROCESSING") return <Loader2 className="h-4 w-4 animate-spin text-brand-500" />;
  return <Clock className="h-4 w-4 text-gray-400" />;
}

function AssetGrid({ assets }: { assets: Array<{ kind: string; url: string }> }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {assets.map((a) => (
        <a key={a.kind} href={a.url} target="_blank" rel="noreferrer" title={a.kind}>
          <img
            src={a.url}
            alt={a.kind}
            className="rounded-lg border w-full aspect-square object-cover hover:opacity-90 transition-opacity"
          />
        </a>
      ))}
    </div>
  );
}

// ─── Polling ──────────────────────────────────────────────────────────────────

function pollJob(jobId: string, setJob: (j: JobResult) => void) {
  const interval = setInterval(async () => {
    try {
      const data = await apiClient.get<JobResult>(`/ai/jobs/${jobId}`);
      setJob(data);
      if (data.status === "DONE" || data.status === "FAILED") {
        clearInterval(interval);
        mutate("/ai/jobs");
      }
    } catch {
      clearInterval(interval);
    }
  }, 2000);
}

// Polling sans setState local — juste un refresh global à la fin
function pollJobCallback(jobId: string, onDone: () => void, onEnd: () => void) {
  const interval = setInterval(async () => {
    try {
      const data = await apiClient.get<JobResult>(`/ai/jobs/${jobId}`);
      if (data.status === "DONE" || data.status === "FAILED") {
        clearInterval(interval);
        onDone();
        onEnd();
      }
    } catch {
      clearInterval(interval);
      onEnd();
    }
  }, 2000);
}
