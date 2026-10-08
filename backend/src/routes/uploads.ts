import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/middleware.js";
import { config } from "../config.js";
import { badRequest, notFound } from "../lib/errors.js";
import { ALLOWED_IMAGE_TYPES, storeFile, uploadDir } from "../lib/storage.js";

export const uploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxBytes, files: 1 },
});

/** Wireframe / image upload for docs (admin only). Accepts PNG, JPG, SVG, GIF, WEBP. */
uploadsRouter.post("/", requireAdmin, upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest("No file uploaded (use form field 'file').");
  if (!ALLOWED_IMAGE_TYPES[file.mimetype]) throw badRequest("Only PNG, JPG, SVG, GIF or WEBP images are allowed.");
  const docId = z.uuid().optional().safeParse(req.body?.docId || undefined);
  const stored = await storeFile(file.buffer, file.mimetype, file.originalname);
  const attachment = await prisma.attachment.create({
    data: {
      fileUrl: stored.url,
      fileName: file.originalname.slice(0, 200),
      uploadedById: req.user!.id,
      docId: docId.success && docId.data ? docId.data : null,
    },
  });
  res.status(201).json({ id: attachment.id, url: stored.url, fileName: attachment.fileName, storage: stored.storage });
});

/** Local-disk fallback (dev). Served to signed-in users only, with a locked-down CSP so SVGs can't run scripts. */
uploadsRouter.get("/files/:name", (req, res) => {
  const name = path.basename(String(req.params.name));
  if (!/^[0-9a-f-]{36}\.[a-z]+$/.test(name)) throw notFound("File not found");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.sendFile(path.join(uploadDir(), name), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "File not found" });
  });
});
