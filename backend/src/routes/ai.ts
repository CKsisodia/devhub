import { Router } from "express";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/middleware.js";
import { ymd } from "../lib/dto.js";
import { draftTasks } from "../lib/llm.js";
import { aiDraftSchema } from "../lib/schemas.js";

export const aiRouter = Router();

/** Drafts task creations/updates from a prompt. Never writes to the database. */
aiRouter.post("/draft", requireAdmin, async (req, res) => {
  const { prompt } = aiDraftSchema.parse(req.body);
  const [projects, users, tasks] = await Promise.all([
    prisma.project.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.task.findMany({
      where: { project: { archived: false } },
      orderBy: { updatedAt: "desc" },
      take: 400,
      select: { id: true, title: true, projectId: true, assigneeId: true, status: true, priority: true, dueDate: true, tags: true },
    }),
  ]);
  const draft = await draftTasks(prompt, {
    today: new Date().toISOString().slice(0, 10),
    projects,
    users,
    tasks: tasks.map((t) => ({ ...t, dueDate: ymd(t.dueDate) })),
  });
  res.json(draft);
});
