import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/svg+xml": ".svg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/** Task attachments: images plus common document / data files. MIME type -> stored extension. */
export const ALLOWED_ATTACHMENT_TYPES: Record<string, string> = {
  ...ALLOWED_IMAGE_TYPES,
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/csv": ".csv",
  "application/json": ".json",
  "application/zip": ".zip",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
};

/** Extension -> canonical MIME type (first match wins, so ".jpg" -> image/jpeg). */
export const mimeForExt = (ext: string): string | undefined => Object.entries(ALLOWED_ATTACHMENT_TYPES).find(([, e]) => e === ext)?.[0];

/**
 * Resolves an uploaded task attachment to an allowed (mimeType, ext), or null if not allowed.
 * Browsers often send "" or application/octet-stream for .md / .csv, so the original file name's extension
 * is accepted as a fallback when it maps to an allowed type. The stored extension always comes from this table.
 */
export function resolveAttachmentType(mimeType: string, originalName: string): { mimeType: string; ext: string } | null {
  const direct = ALLOWED_ATTACHMENT_TYPES[mimeType];
  if (direct) return { mimeType, ext: direct };
  let ext = path.extname(originalName).toLowerCase();
  if (ext === ".jpeg") ext = ".jpg";
  if (ext === ".markdown") ext = ".md";
  const mime = mimeForExt(ext);
  return mime ? { mimeType: mime, ext } : null;
}

export const uploadDir = () => path.resolve(config.uploads.localDir);

export const BLOB_PREFIX = "wireframes/";

/**
 * Stores an uploaded file in a PRIVATE Vercel Blob store when BLOB_READ_WRITE_TOKEN is set, else on local
 * disk (dev). Either way the app only hands out /api/uploads/files/<key>, which requires a signed-in session.
 */
export async function storeFile(buffer: Buffer, mimeType: string, originalName: string, extOverride?: string): Promise<{ url: string; storage: "blob" | "local" }> {
  const ext = extOverride ?? ALLOWED_IMAGE_TYPES[mimeType] ?? path.extname(originalName);
  const key = `${randomUUID()}${ext}`;
  if (config.uploads.blobToken) {
    const { put } = await import("@vercel/blob");
    await put(`${BLOB_PREFIX}${key}`, buffer, { access: "private", contentType: mimeType, token: config.uploads.blobToken, addRandomSuffix: false });
    return { url: `/api/uploads/files/${key}`, storage: "blob" };
  }
  await mkdir(uploadDir(), { recursive: true });
  await writeFile(path.join(uploadDir(), key), buffer);
  return { url: `/api/uploads/files/${key}`, storage: "local" };
}

/** Best-effort removal of a stored file by its app URL (/api/uploads/files/<key>). Never throws. */
export async function deleteStoredFile(url: string): Promise<void> {
  const name = path.basename(url);
  if (!/^[0-9a-f-]{36}\.[a-z]+$/.test(name)) return;
  try {
    if (config.uploads.blobToken) {
      const { del } = await import("@vercel/blob");
      await del(`${BLOB_PREFIX}${name}`, { token: config.uploads.blobToken });
    } else {
      await unlink(path.join(uploadDir(), name));
    }
  } catch (e) {
    console.warn(`[uploads] couldn't delete stored file ${name}`, e);
  }
}
