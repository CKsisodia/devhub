import { Router } from "express";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/middleware.js";
import { diff, logActivity } from "../lib/activity.js";
import { badRequest, notFound } from "../lib/errors.js";
import { backlogDto, backlogInclude } from "../lib/dto.js";
import { BACKLOG_STATUSES, backlogBulkSchema, backlogCreateSchema, backlogStatusSchema, backlogUpdateSchema } from "../lib/schemas.js";

export const backlogRouter = Router();

type Db = typeof prisma | Prisma.TransactionClient;
type CreateInput = z.infer<typeof backlogCreateSchema>;
type UpdateInput = z.infer<typeof backlogUpdateSchema>;
type Status = (typeof BACKLOG_STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = { IN_PROGRESS: "In progress", HOLD: "Hold", DONE: "Done", REJECT: "Reject" };

async function assertProject(db: Db, projectId: string | null | undefined) {
  if (!projectId) return;
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!p) throw badRequest("Project not found");
}

function summarise(title: string, changes: Record<string, { from: unknown; to: unknown }>) {
  const keys = Object.keys(changes);
  if (keys.length === 1 && keys[0] === "status") return `set "${title}" to ${STATUS_LABEL[changes.status.to as Status]}`;
  return `updated "${title}" (${keys.join(", ")})`;
}

export async function createItem(db: Db, userId: string, input: CreateInput) {
  await assertProject(db, input.projectId);
  const item = await db.backlogItem.create({
    data: { title: input.title, notes: input.notes, projectId: input.projectId ?? null, status: input.status, createdById: userId },
    include: backlogInclude,
  });
  await logActivity(db, { userId, entityType: "backlog", entityId: item.id, projectId: item.projectId, action: "created", summary: `added "${item.title}"` });
  return item;
}

export async function updateItem(db: Db, userId: string, id: string, patch: UpdateInput) {
  const before = await db.backlogItem.findUnique({ where: { id } });
  if (!before) throw notFound("Backlog item not found");
  await assertProject(db, patch.projectId);
  const changes = diff(before as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  const item = await db.backlogItem.update({ where: { id }, data: patch, include: backlogInclude });
  if (Object.keys(changes).length) {
    await logActivity(db, { userId, entityType: "backlog", entityId: id, projectId: item.projectId, action: "updated", summary: summarise(item.title, changes), changes });
  }
  return item;
}

backlogRouter.get("/", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const where: Prisma.BacklogItemWhereInput = {};
  if (q.projectId === "none") where.projectId = null;
  else if (q.projectId) where.projectId = q.projectId;
  if (q.status && (BACKLOG_STATUSES as readonly string[]).includes(q.status)) where.status = q.status as Status;
  if (q.q) where.OR = [{ title: { contains: q.q, mode: "insensitive" } }, { notes: { contains: q.q, mode: "insensitive" } }];
  if (!q.projectId) where.AND = [{ OR: [{ projectId: null }, { project: { archived: false } }] }];
  const items = await prisma.backlogItem.findMany({ where, include: backlogInclude, orderBy: [{ updatedAt: "desc" }] });
  res.json(items.map(backlogDto));
});

backlogRouter.post("/", requireAdmin, async (req, res) => {
  const input = backlogCreateSchema.parse(req.body);
  res.status(201).json(backlogDto(await createItem(prisma, req.user!.id, input)));
});

/** Confirm step of AI entry: saves the admin-approved drafts in one transaction. */
backlogRouter.post("/bulk", requireAdmin, async (req, res) => {
  const input = backlogBulkSchema.parse(req.body);
  if (!input.creates.length && !input.updates.length) throw badRequest("Nothing to save");
  const result = await prisma.$transaction(async (tx) => {
    const created = [];
    for (const c of input.creates) created.push(await createItem(tx, req.user!.id, c));
    const updated = [];
    for (const u of input.updates) updated.push(await updateItem(tx, req.user!.id, u.id, u.patch));
    return { created, updated };
  });
  res.status(201).json({ created: result.created.map(backlogDto), updated: result.updated.map(backlogDto) });
});

/** Status change: allowed for EVERY signed-in, active user (admin and viewers). */
backlogRouter.patch("/:id/status", async (req, res) => {
  const { status } = backlogStatusSchema.parse(req.body);
  res.json(backlogDto(await updateItem(prisma, req.user!.id, String(req.params.id), { status })));
});

/** Full edit (title, notes, project, status): admin only. */
backlogRouter.patch("/:id", requireAdmin, async (req, res) => {
  const patch = backlogUpdateSchema.parse(req.body);
  res.json(backlogDto(await updateItem(prisma, req.user!.id, String(req.params.id), patch)));
});

backlogRouter.delete("/:id", requireAdmin, async (req, res) => {
  const item = await prisma.backlogItem.findUnique({ where: { id: String(req.params.id) } });
  if (!item) throw notFound("Backlog item not found");
  await prisma.backlogItem.delete({ where: { id: item.id } });
  await logActivity(prisma, { userId: req.user!.id, entityType: "backlog", entityId: item.id, projectId: item.projectId, action: "deleted", summary: `deleted "${item.title}"` });
  res.status(204).end();
});
