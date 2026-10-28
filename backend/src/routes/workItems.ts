import { Router } from "express";
import multer from "multer";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/middleware.js";
import { diff, logActivity } from "../lib/activity.js";
import { badRequest, notFound } from "../lib/errors.js";
import { config } from "../config.js";
import { attachmentDto, toDate, workItemDto, workItemInclude } from "../lib/dto.js";
import { deleteStoredFile, resolveAttachmentType, storeFile } from "../lib/storage.js";
import { assertExtrasAllowed, workItemBulkSchema, workItemCreateSchema, workItemStatusSchema, workItemUpdateSchema } from "../lib/schemas.js";
import { STATUS_LABEL, WORK_STATUSES, WORK_TYPE_META, type WorkStatus, type WorkType } from "../lib/workTypes.js";

type Db = typeof prisma | Prisma.TransactionClient;
type CreateInput = z.infer<typeof workItemCreateSchema>;
type UpdateInput = z.infer<typeof workItemUpdateSchema>;

/** Task attachments: up to 10 files per upload request, each within UPLOAD_MAX_BYTES. */
const MAX_FILES_PER_UPLOAD = 10;
const attachmentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploads.maxBytes, files: MAX_FILES_PER_UPLOAD } });

type LinkInput = { url: string; label?: string };
const linkRows = (links: LinkInput[]) => links.map((l, i) => ({ url: l.url, label: l.label ?? "", position: i }));
const sameLinks = (a: LinkInput[], b: LinkInput[]) => JSON.stringify(a.map((l) => [l.url, l.label ?? ""])) === JSON.stringify(b.map((l) => [l.url, l.label ?? ""]));

const FIELD_LABEL: Record<string, string> = { projectId: "project", targetPeriod: "target", timeboxEnd: "time box" };

async function assertProject(db: Db, projectId: string | null | undefined) {
  if (!projectId) return;
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!p) throw badRequest("Project not found");
}

function summarise(title: string, changes: Record<string, { from: unknown; to: unknown }>) {
  const keys = Object.keys(changes);
  if (keys.length === 1 && keys[0] === "status") return `set "${title}" to ${STATUS_LABEL[changes.status.to as WorkStatus]}`;
  return `updated "${title}" (${keys.map((k) => FIELD_LABEL[k] ?? k).join(", ")})`;
}

/** Converts API input (YYYY-MM-DD strings) into Prisma data. */
function toData<T extends { timeboxEnd?: string | null }>(input: T) {
  const { timeboxEnd, ...rest } = input;
  return { ...rest, ...(timeboxEnd !== undefined ? { timeboxEnd: toDate(timeboxEnd) } : {}) };
}

export async function createWorkItem(db: Db, type: WorkType, userId: string, input: CreateInput) {
  assertExtrasAllowed(type, input);
  await assertProject(db, input.projectId);
  const { links, ...fields } = input;
  const item = await db.workItem.create({
    data: {
      ...toData(fields),
      type,
      projectId: input.projectId ?? null,
      createdById: userId,
      ...(links?.length ? { links: { create: linkRows(links) } } : {}),
    },
    include: workItemInclude,
  });
  await logActivity(db, { userId, entityType: WORK_TYPE_META[type].entity, entityId: item.id, projectId: item.projectId, action: "created", summary: `added "${item.title}"` });
  return item;
}

export async function updateWorkItem(db: Db, type: WorkType, userId: string, id: string, patch: UpdateInput) {
  assertExtrasAllowed(type, patch);
  const before = await db.workItem.findUnique({ where: { id }, include: { links: { select: { url: true, label: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] } } });
  // An item is only reachable through its own section's URL.
  if (!before || before.type !== type) throw notFound(`${WORK_TYPE_META[type].label} item not found`);
  await assertProject(db, patch.projectId);
  const { links, ...fields } = patch;
  const changes = diff(before as unknown as Record<string, unknown>, fields as Record<string, unknown>);
  // Links are replaced as a list, and only when they actually changed (one atomic nested write).
  const linksChanged = links !== undefined && !sameLinks(before.links, links);
  if (linksChanged) changes.links = { from: before.links.length, to: links.length };
  const item = await db.workItem.update({
    where: { id },
    data: { ...toData(fields), ...(linksChanged ? { links: { deleteMany: {}, create: linkRows(links) } } : {}) },
    include: workItemInclude,
  });
  if (Object.keys(changes).length) {
    await logActivity(db, { userId, entityType: WORK_TYPE_META[type].entity, entityId: id, projectId: item.projectId, action: "updated", summary: summarise(item.title, changes), changes });
  }
  return item;
}

/**
 * The same routes for every work section, mounted at /api/tasks, /api/roadmap, /api/rnd and /api/poc.
 * Status change is open to every signed-in active user; everything else is admin-only.
 */
export function workItemsRouter(type: WorkType) {
  const r = Router();
  const meta = WORK_TYPE_META[type];

  r.get("/", async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const where: Prisma.WorkItemWhereInput = { type };
    if (q.projectId === "none") where.projectId = null;
    else if (q.projectId) where.projectId = q.projectId;
    if (q.status && (WORK_STATUSES as readonly string[]).includes(q.status)) where.status = q.status as WorkStatus;
    if (q.q) where.OR = [{ title: { contains: q.q, mode: "insensitive" } }, { notes: { contains: q.q, mode: "insensitive" } }];
    if (!q.projectId) where.AND = [{ OR: [{ projectId: null }, { project: { archived: false } }] }];
    const items = await prisma.workItem.findMany({ where, include: workItemInclude, orderBy: [{ updatedAt: "desc" }] });
    res.json(items.map(workItemDto));
  });

  r.post("/", requireAdmin, async (req, res) => {
    const input = workItemCreateSchema.parse(req.body);
    res.status(201).json(workItemDto(await createWorkItem(prisma, type, req.user!.id, input)));
  });

  /** Confirm step of AI entry: saves the admin-approved drafts in one transaction. */
  r.post("/bulk", requireAdmin, async (req, res) => {
    const input = workItemBulkSchema.parse(req.body);
    if (!input.creates.length && !input.updates.length) throw badRequest("Nothing to save");
    const result = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const c of input.creates) created.push(await createWorkItem(tx, type, req.user!.id, c));
      const updated = [];
      for (const u of input.updates) updated.push(await updateWorkItem(tx, type, req.user!.id, u.id, u.patch));
      return { created, updated };
    });
    res.status(201).json({ created: result.created.map(workItemDto), updated: result.updated.map(workItemDto) });
  });

  /** Status change: allowed for EVERY signed-in, active user (admin and viewers). */
  r.patch("/:id/status", async (req, res) => {
    const { status } = workItemStatusSchema.parse(req.body);
    res.json(workItemDto(await updateWorkItem(prisma, type, req.user!.id, String(req.params.id), { status })));
  });

  /** Full edit: admin only. */
  r.patch("/:id", requireAdmin, async (req, res) => {
    const patch = workItemUpdateSchema.parse(req.body);
    res.json(workItemDto(await updateWorkItem(prisma, type, req.user!.id, String(req.params.id), patch)));
  });

  r.delete("/:id", requireAdmin, async (req, res) => {
    const item = await prisma.workItem.findUnique({ where: { id: String(req.params.id) }, include: { attachments: { select: { fileUrl: true } } } });
    if (!item || item.type !== type) throw notFound(`${meta.label} item not found`);
    await prisma.workItem.delete({ where: { id: item.id } }); // attachment rows and links cascade
    for (const a of item.attachments) await deleteStoredFile(a.fileUrl);
    await logActivity(prisma, { userId: req.user!.id, entityType: meta.entity, entityId: item.id, projectId: item.projectId, action: "deleted", summary: `deleted "${item.title}"` });
    res.status(204).end();
  });

  if (meta.attachments) {
    const findItem = async (id: string) => {
      const item = await prisma.workItem.findUnique({ where: { id }, select: { id: true, type: true, title: true, projectId: true } });
      if (!item || item.type !== type) throw notFound(`${meta.label} item not found`);
      return item;
    };

    /** Attach files (multipart field "files", up to 10 per request). Admin only. */
    r.post("/:id/attachments", requireAdmin, attachmentUpload.array("files", MAX_FILES_PER_UPLOAD), async (req, res) => {
      const item = await findItem(String(req.params.id));
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!files.length) throw badRequest("No files uploaded (use form field 'files').");
      // Validate every file before storing any of them.
      const typed = files.map((f) => {
        // multer decodes multipart file names as latin1; restore UTF-8 names (e.g. non-English characters).
        const name = Buffer.from(f.originalname, "latin1").toString("utf8").slice(0, 200) || "file";
        const t = resolveAttachmentType(f.mimetype, name);
        if (!t) throw badRequest(`"${name}": file type not allowed. Use images, PDF, text, Markdown, CSV, JSON, ZIP or Office files.`);
        return { file: f, name, ...t };
      });
      const created = [];
      for (const t of typed) {
        const stored = await storeFile(t.file.buffer, t.mimeType, t.name, t.ext);
        created.push(
          await prisma.attachment.create({
            data: { workItemId: item.id, fileUrl: stored.url, fileName: t.name, mimeType: t.mimeType, sizeBytes: t.file.size, uploadedById: req.user!.id },
          }),
        );
      }
      await logActivity(prisma, {
        userId: req.user!.id,
        entityType: meta.entity,
        entityId: item.id,
        projectId: item.projectId,
        action: "updated",
        summary: `attached ${created.length === 1 ? `"${created[0].fileName}"` : `${created.length} files`} to "${item.title}"`,
      });
      res.status(201).json(created.map(attachmentDto));
    });

    /** Remove one attachment (row and stored file). Admin only. */
    r.delete("/:id/attachments/:attachmentId", requireAdmin, async (req, res) => {
      const item = await findItem(String(req.params.id));
      const att = await prisma.attachment.findUnique({ where: { id: String(req.params.attachmentId) } });
      if (!att || att.workItemId !== item.id) throw notFound("Attachment not found");
      await prisma.attachment.delete({ where: { id: att.id } });
      await deleteStoredFile(att.fileUrl);
      await logActivity(prisma, { userId: req.user!.id, entityType: meta.entity, entityId: item.id, projectId: item.projectId, action: "updated", summary: `removed "${att.fileName}" from "${item.title}"` });
      res.status(204).end();
    });
  }

  return r;
}
