import { Router } from "express";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/middleware.js";
import { draftBacklog } from "../lib/llm.js";
import { aiDraftSchema } from "../lib/schemas.js";

export const aiRouter = Router();

/** Drafts backlog creations / updates from a prompt. Never writes to the database. */
aiRouter.post("/draft", requireAdmin, async (req, res) => {
  const { prompt } = aiDraftSchema.parse(req.body);
  const [projects, items] = await Promise.all([
    prisma.project.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.backlogItem.findMany({
      where: { OR: [{ projectId: null }, { project: { archived: false } }] },
      orderBy: { updatedAt: "desc" },
      take: 400,
      select: { id: true, title: true, projectId: true, status: true },
    }),
  ]);
  res.json(await draftBacklog(prompt, { today: new Date().toISOString().slice(0, 10), projects, items }));
});
