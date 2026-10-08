import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/middleware.js";
import { diff, logActivity } from "../lib/activity.js";
import { badRequest, notFound } from "../lib/errors.js";
import { toDate, ymd } from "../lib/dto.js";
import { projectCreateSchema, projectUpdateSchema } from "../lib/schemas.js";
import { statusCounts } from "../lib/stats.js";

export const projectsRouter = Router();

projectsRouter.get("/", async (req, res) => {
  const includeArchived = req.query.includeArchived === "1" || req.query.includeArchived === "true";
  const projects = await prisma.project.findMany({
    where: includeArchived ? {} : { archived: false },
    include: {
      backlogItems: { select: { status: true } },
      members: { include: { user: { select: { id: true, name: true, active: true } } }, orderBy: { addedAt: "asc" } },
    },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
  });
  res.json(
    projects.map((p) => {
      const s = statusCounts(p.backlogItems);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        archived: p.archived,
        startDate: ymd(p.startDate),
        targetDate: ymd(p.targetDate),
        itemCount: s.total,
        progress: s.progress,
        memberCount: p.members.length,
        members: p.members.map((m) => m.user),
      };
    }),
  );
});

projectsRouter.get("/:id", async (req, res) => {
  const p = await prisma.project.findUnique({
    where: { id: String(req.params.id) },
    include: {
      backlogItems: { select: { status: true } },
      members: { include: { user: { select: { id: true, name: true, active: true } } }, orderBy: { addedAt: "asc" } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!p) throw notFound("Project not found");
  const s = statusCounts(p.backlogItems);
  res.json({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    archived: p.archived,
    startDate: ymd(p.startDate),
    targetDate: ymd(p.targetDate),
    createdBy: p.createdBy,
    counts: s.counts,
    itemCount: s.total,
    progress: s.progress,
    members: p.members.map((m) => m.user),
  });
});

projectsRouter.post("/", requireAdmin, async (req, res) => {
  const input = projectCreateSchema.parse(req.body);
  const project = await prisma.project.create({
    data: {
      name: input.name,
      description: input.description,
      status: input.status,
      startDate: toDate(input.startDate ?? null),
      targetDate: toDate(input.targetDate ?? null),
      createdById: req.user!.id,
      members: { create: [...new Set(input.memberIds)].map((userId) => ({ userId })) },
    },
  });
  await logActivity(prisma, { userId: req.user!.id, entityType: "project", entityId: project.id, projectId: project.id, action: "created", summary: `created project ${project.name}` });
  res.status(201).json({ id: project.id });
});

projectsRouter.patch("/:id", requireAdmin, async (req, res) => {
  const patch = projectUpdateSchema.parse(req.body);
  const before = await prisma.project.findUnique({ where: { id: String(req.params.id) } });
  if (!before) throw notFound("Project not found");
  const changes = diff(before as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  const p = await prisma.project.update({
    where: { id: before.id },
    data: { ...patch, startDate: toDate(patch.startDate), targetDate: toDate(patch.targetDate) },
  });
  await logActivity(prisma, { userId: req.user!.id, entityType: "project", entityId: p.id, projectId: p.id, action: "updated", summary: `updated project ${p.name}`, changes });
  res.json({ id: p.id });
});

projectsRouter.delete("/:id", requireAdmin, async (req, res) => {
  const p = await prisma.project.findUnique({ where: { id: String(req.params.id) } });
  if (!p) throw notFound("Project not found");
  await prisma.project.delete({ where: { id: p.id } }); // cascades members and docs; backlog items keep existing without a project
  await logActivity(prisma, { userId: req.user!.id, entityType: "project", entityId: p.id, action: "deleted", summary: `deleted project ${p.name}` });
  res.status(204).end();
});

projectsRouter.post("/:id/members", requireAdmin, async (req, res) => {
  const { userId } = z.object({ userId: z.uuid() }).parse(req.body);
  const [p, u] = await Promise.all([
    prisma.project.findUnique({ where: { id: String(req.params.id) } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!p) throw notFound("Project not found");
  if (!u) throw badRequest("User not found");
  await prisma.projectMember.upsert({ where: { projectId_userId: { projectId: p.id, userId } }, update: {}, create: { projectId: p.id, userId } });
  await logActivity(prisma, { userId: req.user!.id, entityType: "project", entityId: p.id, projectId: p.id, action: "updated", summary: `added ${u.name} to ${p.name}` });
  res.status(201).json({ ok: true });
});

projectsRouter.delete("/:id/members/:userId", requireAdmin, async (req, res) => {
  const projectId = String(req.params.id);
  const userId = String(req.params.userId);
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, include: { user: true, project: true } });
  if (!m) throw notFound("Member not found");
  await prisma.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
  await logActivity(prisma, { userId: req.user!.id, entityType: "project", entityId: projectId, projectId, action: "updated", summary: `removed ${m.user.name} from ${m.project.name}` });
  res.status(204).end();
});
