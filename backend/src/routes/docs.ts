import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/middleware.js";
import { logActivity } from "../lib/activity.js";
import { badRequest, notFound } from "../lib/errors.js";
import { docCreateSchema, docUpdateSchema } from "../lib/schemas.js";

export const docsRouter = Router();

type Db = typeof prisma | Prisma.TransactionClient;

/** One level of nesting: a parent must be a top-level page in the same space. */
async function assertValidParent(db: Db, docId: string | null, projectId: string | null, parentId: string | null | undefined) {
  if (!parentId) return;
  if (parentId === docId) throw badRequest("A page can't be its own parent.");
  const parent = await db.doc.findUnique({ where: { id: parentId } });
  if (!parent) throw badRequest("Parent page not found");
  if (parent.projectId !== projectId) throw badRequest("Parent page must be in the same project.");
  if (parent.parentId) throw badRequest("Only one level of nesting is allowed: pick a top-level page as parent.");
  if (docId) {
    const children = await db.doc.count({ where: { parentId: docId } });
    if (children > 0) throw badRequest("This page has sub-pages, so it can't be nested under another page.");
  }
}

/** ?projectId=<uuid> for a project space, or ?projectId=general (or omitted) for the General space. */
docsRouter.get("/", async (req, res) => {
  const raw = typeof req.query.projectId === "string" ? req.query.projectId : "general";
  const projectId = raw === "general" ? null : raw;
  const docs = await prisma.doc.findMany({
    where: { projectId },
    select: { id: true, title: true, parentId: true, position: true, updatedAt: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  res.json(docs.map((d) => ({ ...d, updatedAt: d.updatedAt.toISOString() })));
});

docsRouter.get("/:id", async (req, res) => {
  const d = await prisma.doc.findUnique({
    where: { id: String(req.params.id) },
    include: {
      project: { select: { id: true, name: true } },
      parent: { select: { id: true, title: true } },
      updatedBy: { select: { id: true, name: true } },
      children: { select: { id: true }, take: 1 },
    },
  });
  if (!d) throw notFound("Page not found");
  res.json({
    id: d.id,
    title: d.title,
    content: d.content,
    projectId: d.projectId,
    project: d.project,
    parentId: d.parentId,
    parent: d.parent,
    hasChildren: d.children.length > 0,
    updatedBy: d.updatedBy,
    updatedAt: d.updatedAt.toISOString(),
  });
});

docsRouter.post("/", requireAdmin, async (req, res) => {
  const input = docCreateSchema.parse(req.body);
  if (input.projectId) {
    const p = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!p) throw badRequest("Project not found");
  }
  await assertValidParent(prisma, null, input.projectId, input.parentId);
  const position = await prisma.doc.count({ where: { projectId: input.projectId, parentId: input.parentId ?? null } });
  const doc = await prisma.doc.create({
    data: {
      title: input.title,
      content: input.content,
      projectId: input.projectId,
      parentId: input.parentId ?? null,
      position,
      createdById: req.user!.id,
      updatedById: req.user!.id,
    },
  });
  await logActivity(prisma, { userId: req.user!.id, entityType: "doc", entityId: doc.id, projectId: doc.projectId, action: "created", summary: `created doc "${doc.title}"` });
  res.status(201).json({ id: doc.id });
});

docsRouter.patch("/:id", requireAdmin, async (req, res) => {
  const patch = docUpdateSchema.parse(req.body);
  const before = await prisma.doc.findUnique({ where: { id: String(req.params.id) } });
  if (!before) throw notFound("Page not found");
  if (patch.parentId !== undefined) await assertValidParent(prisma, before.id, before.projectId, patch.parentId);
  const doc = await prisma.doc.update({ where: { id: before.id }, data: { ...patch, updatedById: req.user!.id } });
  const changed = Object.keys(patch).filter((k) => k !== "content" || before.content !== patch.content);
  await logActivity(prisma, {
    userId: req.user!.id,
    entityType: "doc",
    entityId: doc.id,
    projectId: doc.projectId,
    action: "updated",
    summary: patch.parentId !== undefined && patch.parentId !== before.parentId ? `moved doc "${doc.title}"` : `updated doc "${doc.title}"`,
    changes: { fields: changed },
  });
  res.json({ id: doc.id });
});

docsRouter.delete("/:id", requireAdmin, async (req, res) => {
  const doc = await prisma.doc.findUnique({ where: { id: String(req.params.id) } });
  if (!doc) throw notFound("Page not found");
  await prisma.doc.delete({ where: { id: doc.id } }); // sub-pages are deleted with it
  await logActivity(prisma, { userId: req.user!.id, entityType: "doc", entityId: doc.id, projectId: doc.projectId, action: "deleted", summary: `deleted doc "${doc.title}"` });
  res.status(204).end();
});
