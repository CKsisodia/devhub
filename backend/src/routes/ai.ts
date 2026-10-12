import { Router } from "express";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/middleware.js";
import { draftWorkItems } from "../lib/llm.js";
import { aiDraftSchema } from "../lib/schemas.js";
import { ymd } from "../lib/dto.js";

export const aiRouter = Router();

/** Drafts creations / updates for one work section (Tasks, Roadmap, R&D or POC). Never writes to the database. */
aiRouter.post("/draft", requireAdmin, async (req, res) => {
  const { prompt, type } = aiDraftSchema.parse(req.body);
  const [projects, items] = await Promise.all([
    prisma.project.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.workItem.findMany({
      where: { type, OR: [{ projectId: null }, { project: { archived: false } }] },
      orderBy: { updatedAt: "desc" },
      take: 400,
      select: { id: true, title: true, projectId: true, status: true, targetPeriod: true, goal: true, timeboxEnd: true, findings: true, outcome: true },
    }),
  ]);
  res.json(
    await draftWorkItems(prompt, {
      today: new Date().toISOString().slice(0, 10),
      type,
      projects,
      items: items.map((i) => ({ ...i, timeboxEnd: ymd(i.timeboxEnd) })),
    }),
  );
});
