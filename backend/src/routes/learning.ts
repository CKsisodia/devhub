import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/middleware.js";
import { diff, logActivity } from "../lib/activity.js";
import { notFound } from "../lib/errors.js";
import { LEARNING_TYPES, learningCreateSchema, learningUpdateSchema } from "../lib/schemas.js";

export const learningRouter = Router();

type Item = Prisma.LearningItemGetPayload<{ include: { createdBy: { select: { id: true; name: true } } } }>;

function dto(i: Item, withBody = false) {
  return {
    id: i.id,
    type: i.type,
    title: i.title,
    url: i.url,
    summary: i.summary,
    isPost: !i.url,
    body: withBody ? i.body : undefined,
    tags: i.tags,
    pinned: i.pinned,
    createdBy: i.createdBy,
    createdAt: i.createdAt.toISOString(),
  };
}

const include = { createdBy: { select: { id: true, name: true } } } as const;

learningRouter.get("/", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const where: Prisma.LearningItemWhereInput = {};
  if (q.type && (LEARNING_TYPES as readonly string[]).includes(q.type)) where.type = q.type as (typeof LEARNING_TYPES)[number];
  const tags = (q.tags ?? "").split(",").filter(Boolean);
  if (tags.length) where.tags = { hasSome: tags };
  if (q.q) where.OR = [{ title: { contains: q.q, mode: "insensitive" } }, { summary: { contains: q.q, mode: "insensitive" } }];
  const items = await prisma.learningItem.findMany({ where, include, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] });
  res.json(items.map((i) => dto(i)));
});

learningRouter.get("/tags", async (_req, res) => {
  const rows = await prisma.$queryRaw<{ tag: string }[]>`SELECT DISTINCT unnest(tags) AS tag FROM learning_items ORDER BY tag`;
  res.json(rows.map((r) => r.tag));
});

learningRouter.get("/:id", async (req, res) => {
  const item = await prisma.learningItem.findUnique({ where: { id: String(req.params.id) }, include });
  if (!item) throw notFound("Item not found");
  res.json(dto(item, true));
});

learningRouter.post("/", requireAdmin, async (req, res) => {
  const input = learningCreateSchema.parse(req.body);
  const item = await prisma.learningItem.create({
    data: { ...input, url: input.url || null, body: input.url ? null : (input.body ?? null), createdById: req.user!.id },
    include,
  });
  await logActivity(prisma, { userId: req.user!.id, entityType: "learning", entityId: item.id, action: "created", summary: `added "${item.title}" to Learning` });
  res.status(201).json(dto(item, true));
});

learningRouter.patch("/:id", requireAdmin, async (req, res) => {
  const patch = learningUpdateSchema.parse(req.body);
  const before = await prisma.learningItem.findUnique({ where: { id: String(req.params.id) } });
  if (!before) throw notFound("Item not found");
  const item = await prisma.learningItem.update({ where: { id: before.id }, data: patch, include });
  await logActivity(prisma, {
    userId: req.user!.id,
    entityType: "learning",
    entityId: item.id,
    action: "updated",
    summary: `updated "${item.title}"`,
    changes: diff(before as unknown as Record<string, unknown>, patch as Record<string, unknown>),
  });
  res.json(dto(item, true));
});

learningRouter.delete("/:id", requireAdmin, async (req, res) => {
  const item = await prisma.learningItem.findUnique({ where: { id: String(req.params.id) } });
  if (!item) throw notFound("Item not found");
  await prisma.learningItem.delete({ where: { id: item.id } });
  await logActivity(prisma, { userId: req.user!.id, entityType: "learning", entityId: item.id, action: "deleted", summary: `deleted "${item.title}"` });
  res.status(204).end();
});
