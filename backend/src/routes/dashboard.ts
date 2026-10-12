import { Router } from "express";
import { prisma } from "../db.js";
import { forbidden, notFound } from "../lib/errors.js";
import { workItemDto, workItemInclude } from "../lib/dto.js";
import { countsByType, statusCounts } from "../lib/stats.js";
import { WORK_ENTITY_TYPES } from "../lib/workTypes.js";

export const dashboardRouter = Router();

/**
 * User-wise dashboard across the four work sections (Tasks, Roadmap, R&D, POC): items in the projects the
 * user is a member of, plus items not tied to any project. Viewers see only their own; the admin can pass
 * ?userId= to see anyone's.
 */
dashboardRouter.get("/", async (req, res) => {
  const me = req.user!;
  const requested = typeof req.query.userId === "string" && req.query.userId ? req.query.userId : me.id;
  if (requested !== me.id && me.role !== "admin") throw forbidden("You can only view your own dashboard.");

  const user = await prisma.user.findUnique({ where: { id: requested }, select: { id: true, name: true, active: true } });
  if (!user) throw notFound("User not found");

  const memberships = await prisma.projectMember.findMany({
    where: { userId: user.id, project: { archived: false } },
    include: { project: { include: { workItems: { select: { status: true } } } } },
  });
  const projectIds = memberships.map((m) => m.projectId);

  const items = await prisma.workItem.findMany({
    where: { OR: [{ projectId: { in: projectIds } }, { projectId: null }] },
    include: workItemInclude,
    orderBy: { updatedAt: "desc" },
  });

  const projects = memberships
    .map(({ project: p }) => ({ id: p.id, name: p.name, status: p.status, ...statusCounts(p.workItems) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const activity = await prisma.activityLog.findMany({
    where: {
      entityType: { in: [...WORK_ENTITY_TYPES, "doc"] },
      OR: [{ projectId: { in: projectIds } }, { entityType: { in: WORK_ENTITY_TYPES }, projectId: null }],
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  res.json({
    user,
    byType: countsByType(items),
    counts: statusCounts(items).counts,
    inProgress: items.filter((i) => i.status === "IN_PROGRESS").slice(0, 8).map(workItemDto),
    upNext: items.filter((i) => i.status === "TODO").slice(0, 5).map(workItemDto),
    onHold: items.filter((i) => i.status === "HOLD").slice(0, 5).map(workItemDto),
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
