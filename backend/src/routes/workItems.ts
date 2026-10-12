import { Router } from "express";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/middleware.js";
import { diff, logActivity } from "../lib/activity.js";
import { badRequest, notFound } from "../lib/errors.js";
import { toDate, workItemDto, workItemInclude } from "../lib/dto.js";
import { assertExtrasAllowed, workItemBulkSchema, workItemCreateSchema, workItemStatusSchema, workItemUpdateSchema } from "../lib/schemas.js";
import { STATUS_LABEL, WORK_STATUSES, WORK_TYPE_META, type WorkStatus, type WorkType } from "../lib/workTypes.js";

type Db = typeof prisma | Prisma.TransactionClient;
type CreateInput = z.infer<typeof workItemCreateSchema>;
type UpdateInput = z.infer<typeof workItemUpdateSchema>;

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
  const item = await db.workItem.create({
    data: { ...toData(input), type, projectId: input.projectId ?? null, createdById: userId },
    include: workItemInclude,
  });
  await logActivity(db, { userId, entityType: WORK_TYPE_META[type].entity, entityId: item.id, projectId: item.projectId, action: "created", summary: `added "${item.title}"` });
  return item;
}

export async function updateWorkItem(db: Db, type: WorkType, userId: string, id: string, patch: UpdateInput) {
  assertExtrasAllowed(type, patch);
  const before = await db.workItem.findUnique({ where: { id } });
  // An item is only reachable through its own section's URL.
  if (!before || before.type !== type) throw notFound(`${WORK_TYPE_META[type].label} item not found`);
  await assertProject(db, patch.projectId);
  const changes = diff(before as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  const item = await db.workItem.update({ where: { id }, data: toData(patch), include: workItemInclude });
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
    const item = await prisma.workItem.findUnique({ where: { id: String(req.params.id) } });
    if (!item || item.type !== type) throw notFound(`${meta.label} item not found`);
    await prisma.workItem.delete({ where: { id: item.id } });
    await logActivity(prisma, { userId: req.user!.id, entityType: meta.entity, entityId: item.id, projectId: item.projectId, action: "deleted", summary: `deleted "${item.title}"` });
    res.status(204).end();
  });

  return r;
}
