import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/middleware.js";
import { diff, logActivity } from "../lib/activity.js";
import { badRequest, notFound } from "../lib/errors.js";
import { taskDto, taskInclude, toDate } from "../lib/dto.js";
import { TASK_PRIORITIES, TASK_STATUSES, taskBulkSchema, taskCreateSchema, taskUpdateSchema } from "../lib/schemas.js";
import type { z } from "zod";

export const tasksRouter = Router();

type Db = typeof prisma | Prisma.TransactionClient;
type CreateInput = z.infer<typeof taskCreateSchema>;
type UpdateInput = z.infer<typeof taskUpdateSchema>;

async function assertRefs(db: Db, refs: { projectId?: string; assigneeId?: string | null }) {
  if (refs.projectId) {
    const p = await db.project.findUnique({ where: { id: refs.projectId }, select: { id: true } });
    if (!p) throw badRequest("Project not found");
  }
  if (refs.assigneeId) {
    const u = await db.user.findUnique({ where: { id: refs.assigneeId }, select: { id: true } });
    if (!u) throw badRequest("Assignee not found");
  }
}

const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function summarise(title: string, changes: Record<string, { from: unknown; to: unknown }>) {
  const keys = Object.keys(changes);
  if (keys.length === 1 && keys[0] === "status") return `moved "${title}" to ${label(String(changes.status.to))}`;
  if (keys.length === 1 && keys[0] === "assigneeId") return `reassigned "${title}"`;
  return `updated "${title}" (${keys.join(", ")})`;
}

export async function createTask(db: Db, userId: string, input: CreateInput) {
  await assertRefs(db, input);
  const task = await db.task.create({
    data: {
      title: input.title,
      description: input.description,
      projectId: input.projectId,
      assigneeId: input.assigneeId ?? null,
      priority: input.priority,
      status: input.status,
      dueDate: toDate(input.dueDate ?? null),
      tags: input.tags,
      createdById: userId,
    },
    include: taskInclude,
  });
  await logActivity(db, { userId, entityType: "task", entityId: task.id, projectId: task.projectId, action: "created", summary: `created "${task.title}"` });
  return task;
}

export async function updateTask(db: Db, userId: string, id: string, patch: UpdateInput) {
  const before = await db.task.findUnique({ where: { id } });
  if (!before) throw notFound("Task not found");
  await assertRefs(db, patch);
  const changes = diff(before as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  const task = await db.task.update({
    where: { id },
    data: { ...patch, dueDate: toDate(patch.dueDate) },
    include: taskInclude,
  });
  if (Object.keys(changes).length) {
    await logActivity(db, { userId, entityType: "task", entityId: id, projectId: task.projectId, action: "updated", summary: summarise(task.title, changes), changes });
  }
  return task;
}

tasksRouter.get("/", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const where: Prisma.TaskWhereInput = {};
  if (q.projectId) where.projectId = q.projectId;
  if (q.assigneeId === "none") where.assigneeId = null;
  else if (q.assigneeId) where.assigneeId = q.assigneeId;
  if (q.status && (TASK_STATUSES as readonly string[]).includes(q.status)) where.status = q.status as (typeof TASK_STATUSES)[number];
  if (q.priority && (TASK_PRIORITIES as readonly string[]).includes(q.priority)) where.priority = q.priority as (typeof TASK_PRIORITIES)[number];
  if (q.tag) where.tags = { has: q.tag };
  if (q.q) where.title = { contains: q.q, mode: "insensitive" };
  if (!q.projectId) where.project = { archived: false };
  const tasks = await prisma.task.findMany({ where, include: taskInclude, orderBy: [{ updatedAt: "desc" }] });
  res.json(tasks.map(taskDto));
});

tasksRouter.get("/tags", async (_req, res) => {
  const rows = await prisma.$queryRaw<{ tag: string }[]>`SELECT DISTINCT unnest(tags) AS tag FROM tasks ORDER BY tag`;
  res.json(rows.map((r) => r.tag));
});

tasksRouter.get("/:id", async (req, res) => {
  const task = await prisma.task.findUnique({ where: { id: String(req.params.id) }, include: taskInclude });
  if (!task) throw notFound("Task not found");
  const history = await prisma.activityLog.findMany({
    where: { entityType: "task", entityId: task.id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  res.json({
    ...taskDto(task),
    history: history.map((h) => ({ id: h.id, user: h.user, action: h.action, summary: h.summary, changes: h.changes, createdAt: h.createdAt.toISOString() })),
  });
});

tasksRouter.post("/", requireAdmin, async (req, res) => {
  const input = taskCreateSchema.parse(req.body);
  const task = await createTask(prisma, req.user!.id, input);
  res.status(201).json(taskDto(task));
});

/** Confirm step of prompt-based entry: saves the admin-approved drafts in one transaction. */
tasksRouter.post("/bulk", requireAdmin, async (req, res) => {
  const input = taskBulkSchema.parse(req.body);
  if (!input.creates.length && !input.updates.length) throw badRequest("Nothing to save");
  const result = await prisma.$transaction(async (tx) => {
    const created = [];
    for (const c of input.creates) created.push(await createTask(tx, req.user!.id, c));
    const updated = [];
    for (const u of input.updates) updated.push(await updateTask(tx, req.user!.id, u.id, u.patch));
    return { created, updated };
  });
  res.status(201).json({ created: result.created.map(taskDto), updated: result.updated.map(taskDto) });
});

tasksRouter.patch("/:id", requireAdmin, async (req, res) => {
  const patch = taskUpdateSchema.parse(req.body);
  const task = await updateTask(prisma, req.user!.id, String(req.params.id), patch);
  res.json(taskDto(task));
});

tasksRouter.delete("/:id", requireAdmin, async (req, res) => {
  const task = await prisma.task.findUnique({ where: { id: String(req.params.id) } });
  if (!task) throw notFound("Task not found");
  await prisma.task.delete({ where: { id: task.id } });
  await logActivity(prisma, { userId: req.user!.id, entityType: "task", entityId: task.id, projectId: task.projectId, action: "deleted", summary: `deleted "${task.title}"` });
  res.status(204).end();
});
