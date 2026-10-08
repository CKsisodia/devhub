import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/svg+xml": ".svg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

export const uploadDir = () => path.resolve(config.uploads.localDir);

/** Stores an uploaded image in Vercel Blob when BLOB_READ_WRITE_TOKEN is set, else on local disk (dev). */
export async function storeFile(buffer: Buffer, mimeType: string, originalName: string): Promise<{ url: string; storage: "blob" | "local" }> {
  const ext = ALLOWED_IMAGE_TYPES[mimeType] ?? path.extname(originalName);
  const key = `${randomUUID()}${ext}`;
  if (config.uploads.blobToken) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`wireframes/${key}`, buffer, { access: "public", contentType: mimeType, token: config.uploads.blobToken });
    return { url: blob.url, storage: "blob" };
  }
  await mkdir(uploadDir(), { recursive: true });
  await writeFile(path.join(uploadDir(), key), buffer);
  return { url: `/api/uploads/files/${key}`, storage: "local" };
}
