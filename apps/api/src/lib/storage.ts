/**
 * StorageService — Cloudflare R2 (compatible S3)
 *
 * Utilisé pour stocker :
 *   - Logos uploadés par les commerçants
 *   - Images générées par l'IA
 *   - (Futur) .pkpass Apple Wallet
 *
 * Cloudflare R2 est compatible avec le SDK AWS S3 v3.
 * Configuration via les variables d'env R2_*.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

export class StorageService {
  private s3: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    this.bucket = process.env["R2_BUCKET_NAME"] ?? "loyalty-assets";
    this.publicUrl = process.env["R2_PUBLIC_URL"] ?? "http://localhost:9000";

    this.s3 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env["R2_ACCOUNT_ID"]}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env["R2_ACCESS_KEY_ID"] ?? "",
        secretAccessKey: process.env["R2_SECRET_ACCESS_KEY"] ?? "",
      },
    });
  }

  /**
   * Upload un Buffer sur R2 et retourne l'URL publique.
   */
  async upload(buffer: Buffer, key: string, contentType = "application/octet-stream"): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    return `${this.publicUrl}/${key}`;
  }

  /**
   * Télécharge une image depuis une URL externe puis l'upload sur R2.
   * Utilisé pour stocker les images retournées par OpenAI (URLs temporaires).
   */
  async uploadFromUrl(sourceUrl: string, key: string): Promise<string> {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Impossible de télécharger l'image : ${sourceUrl}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "image/png";

    return this.upload(buffer, key, contentType);
  }

  /**
   * Télécharge un fichier depuis R2 et retourne un Buffer.
   */
  async download(key: string): Promise<Buffer | null> {
    try {
      const response = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      );

      const stream = response.Body;
      if (!stream) return null;

      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }
}
