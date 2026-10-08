import { Router } from "express";
import { prisma } from "../db.js";
import { forbidden, notFound } from "../lib/errors.js";
import { PRIORITY_RANK, taskDto, taskInclude } from "../lib/dto.js";
import { TASK_STATUSES } from "../lib/schemas.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (req, res) => {
  const me = req.user!;
  const requested = typeof req.query.userId === "string" && req.query.userId ? req.query.userId : me.id;
  // Viewers can only ever see their own dashboard (enforced here, not just in the UI).
  if (requested !== me.id && me.role !== "admin") throw forbidden("You can only view your own dashboard.");

  const user = await prisma.user.findUnique({ where: { id: requested }, select: { id: true, name: true, active: true } });
  if (!user) throw notFound("User not found");

  const tasks = await prisma.task.findMany({ where: { assigneeId: user.id }, include: taskInclude });
  const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<(typeof TASK_STATUSES)[number], number>;
  for (const t of tasks) counts[t.status]++;

  const openTasks = tasks
    .filter((t) => t.status !== "DONE")
    .sort((a, b) => {
      const ad = a.dueDate?.getTime() ?? Infinity;
      const bd = b.dueDate?.getTime() ?? Infinity;
      if (ad !== bd) return ad - bd;
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    })
    .map(taskDto);

  const memberships = await prisma.projectMember.findMany({
    where: { userId: user.id, project: { archived: false } },
    include: { project: { include: { tasks: { select: { status: true } } } } },
  });
  const projects = memberships
    .map(({ project: p }) => {
      const total = p.tasks.length;
      const done = p.tasks.filter((t) => t.status === "DONE").length;
      return { id: p.id, name: p.name, status: p.status, total, done, progress: total ? Math.round((done / total) * 100) : 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const projectIds = projects.map((p) => p.id);
  const taskIds = tasks.map((t) => t.id);
  const activity = await prisma.activityLog.findMany({
    where: {
      entityType: { in: ["task", "doc"] },
      OR: [{ projectId: { in: projectIds } }, { entityId: { in: taskIds } }],
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  res.json({
    user,
    counts,
    openTasks,
    projects,
    activity: activity.map((a) => ({
      id: a.id,
      user: a.user,
      entityType: a.entityType,
      entityId: a.entityId,
      action: a.action,
      summary: a.summary,
      createdAt: a.createdAt.toISOString(),
    })),
  });
});
