/**
 * Worker BullMQ — Jobs IA
 *
 * Ce worker tourne en processus séparé (ou co-localisé avec l'API en dev).
 * Il traite les jobs de la queue "ai-jobs" :
 *   - CLEAN_LOGO          : appel OpenAI Images pour nettoyer un logo
 *   - GENERATE_PASS_DESIGN : générer 3 designs de carte fidélité
 *   - GENERATE_PROMO_ASSETS : générer des assets promo (story, affiche, coupon)
 *
 * Chaque job :
 *   1. Met le statut à PROCESSING
 *   2. Appelle OpenAI Images API
 *   3. Stocke le résultat sur R2
 *   4. Crée des AiAssets en base
 *   5. Met le statut à DONE (ou FAILED)
 *   6. Incrémente le compteur d'usage
 */

import { Worker } from "bullmq";
import { prisma } from "@loyalty/database";
import { getRedisConnection } from "../lib/queue.js";
import { AiService } from "../services/ai.service.js";
import { StorageService } from "../lib/storage.js";
import OpenAI, { toFile } from "openai";

const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
const storageService = new StorageService();
const aiService = new AiService();

// Coût estimé par image (quality=low, 1024×1024)
const COST_PER_IMAGE_USD = 0.011;

const worker = new Worker(
  "ai-jobs",
  async (job) => {
    const { jobId, businessId, payload } = job.data as {
      jobId: string;
      businessId: string;
      payload: Record<string, unknown>;
    };

    // 1. Marquer comme en cours
    await prisma.aiJob.update({
      where: { id: jobId },
      data: { status: "PROCESSING" },
    });

    try {
      const assets = await processJob(job.name, payload, businessId, jobId);

      // 5. Succès
      await prisma.aiJob.update({
        where: { id: jobId },
        data: {
          status: "DONE",
          completed_at: new Date(),
          cost_estimate: assets.length * COST_PER_IMAGE_USD,
        },
      });

      // 6. Incrémenter le quota
      await aiService.incrementUsage(businessId, assets.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      await prisma.aiJob.update({
        where: { id: jobId },
        data: { status: "FAILED", error_message: message },
      });

      throw err; // BullMQ gère le retry
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 2, // traiter max 2 jobs en parallèle
  }
);

worker.on("completed", (job) => console.log(`Job ${job.id} terminé`));
worker.on("failed", (job, err) => console.error(`Job ${job?.id} échoué :`, err));

// ─── Handlers par type de job ─────────────────────────────────────────────────

async function processJob(
  type: string,
  payload: Record<string, unknown>,
  businessId: string,
  jobId: string
): Promise<Array<{ kind: string; url: string }>> {
  switch (type) {
    case "CLEAN_LOGO":
      return cleanLogo(payload, businessId, jobId);
    case "GENERATE_PASS_DESIGN":
      return generatePassDesign(payload, businessId, jobId);
    case "GENERATE_PROMO_ASSETS":
      return generatePromoAssets(payload, businessId, jobId);
    default:
      throw new Error(`Type de job inconnu : ${type}`);
  }
}

async function cleanLogo(
  payload: Record<string, unknown>,
  businessId: string,
  jobId: string
) {
  // 1. Télécharger le logo source depuis l'URL fournie
  const sourceUrl = payload["source_url"] as string;
  const sourceRes = await fetch(sourceUrl);
  if (!sourceRes.ok) throw new Error(`Impossible de télécharger le logo source : ${sourceUrl}`);

  const sourceBuffer = Buffer.from(await sourceRes.arrayBuffer());
  const sourceContentType = sourceRes.headers.get("content-type") ?? "image/png";

  // 2. Préparer le fichier pour l'API OpenAI
  const imageFile = await toFile(sourceBuffer, "logo.png", { type: sourceContentType });

  const instructions = payload["instructions"] ? ` ${payload["instructions"]}` : "";
  const prompt = `Remove the background completely and isolate the logo subject on a transparent background. Preserve all logo colors and shapes exactly.${instructions}`;

  // 3. Appel gpt-image-1 en mode édition (edit = image en entrée, pas juste du texte)
  const response = await openai.images.edit({
    model: "gpt-image-1",
    image: imageFile,
    prompt,
    n: 1,
    size: "1024x1024",
  });

  // 4. Récupérer l'image — gpt-image-1 retourne du base64
  const imageData = response.data?.[0];
  if (!imageData) throw new Error("OpenAI n'a pas retourné d'image");

  let imageBuffer: Buffer;
  if (imageData.b64_json) {
    imageBuffer = Buffer.from(imageData.b64_json, "base64");
  } else if (imageData.url) {
    const res = await fetch(imageData.url);
    imageBuffer = Buffer.from(await res.arrayBuffer());
  } else {
    throw new Error("Format de réponse OpenAI non reconnu");
  }

  // 5. Upload sur R2 et enregistrement
  const storageUrl = await storageService.upload(imageBuffer, `ai/${businessId}/logo_cleaned.png`, "image/png");

  await prisma.aiAsset.create({
    data: { business_id: businessId, job_id: jobId, kind: "logo_cleaned", storage_url: storageUrl },
  });

  return [{ kind: "logo_cleaned", url: storageUrl }];
}

async function generatePassDesign(
  payload: Record<string, unknown>,
  businessId: string,
  jobId: string
) {
  const variants = (payload["variants"] as number) ?? 3;
  const results = [];

  for (let i = 1; i <= variants; i++) {
    const prompt = `Loyalty card wallet pass design, ${payload["style_prompt"]}, variant ${i}, clean minimal style, 1024x1024`;

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "url",
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) continue;

    const storageUrl = await storageService.uploadFromUrl(
      imageUrl,
      `ai/${businessId}/pass_design_${i}.png`
    );

    await prisma.aiAsset.create({
      data: { business_id: businessId, job_id: jobId, kind: `pass_design_${i}`, storage_url: storageUrl },
    });

    results.push({ kind: `pass_design_${i}`, url: storageUrl });
  }

  return results;
}

async function generatePromoAssets(
  payload: Record<string, unknown>,
  businessId: string,
  jobId: string
) {
  const assets = (payload["assets"] as string[]) ?? ["story_ig"];
  const results = [];

  for (const assetType of assets) {
    const prompt = buildPromoPrompt(assetType, payload);

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "url",
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) continue;

    const storageUrl = await storageService.uploadFromUrl(
      imageUrl,
      `ai/${businessId}/promo_${assetType}.png`
    );

    await prisma.aiAsset.create({
      data: { business_id: businessId, job_id: jobId, kind: `promo_${assetType}`, storage_url: storageUrl },
    });

    results.push({ kind: `promo_${assetType}`, url: storageUrl });
  }

  return results;
}

function buildPromoPrompt(assetType: string, payload: Record<string, unknown>): string {
  const text = payload["promo_text"] as string;
  switch (assetType) {
    case "story_ig":
      return `Instagram story 9:16, promotional, text: "${text}", professional design, modern`;
    case "poster_a4":
      return `A4 promotional poster, text: "${text}", with QR code placeholder, professional print design`;
    case "coupon":
      return `Digital coupon design, text: "${text}", clean minimal style`;
    default:
      return text;
  }
}
