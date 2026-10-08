import { Router } from "express";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/middleware.js";
import { revokeSessionsFor } from "../auth/supertokens.js";
import { logActivity } from "../lib/activity.js";
import { badRequest, HttpError, notFound } from "../lib/errors.js";
import { maskPhone, normalizePhone } from "../lib/phone.js";
import { userCreateSchema, userUpdateSchema } from "../lib/schemas.js";

export const usersRouter = Router();

usersRouter.get("/", async (req, res) => {
  const users = await prisma.user.findMany({ include: { role: true }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  if (req.user!.role !== "admin") {
    // Viewers: names only (needed to show assignees / members).
    return res.json(users.map((u) => ({ id: u.id, name: u.name, active: u.active })));
  }
  res.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      active: u.active,
      role: u.role.name,
      phoneMasked: maskPhone(u.phoneNumber),
      hasSignedIn: Boolean(u.supertokensUserId),
      createdAt: u.createdAt.toISOString(),
    })),
  );
});

usersRouter.post("/", requireAdmin, async (req, res) => {
  const body = userCreateSchema.parse(req.body);
  const phoneNumber = normalizePhone(body.phoneNumber);
  if (!phoneNumber) throw badRequest("Enter a valid mobile number, e.g. +91 98765 43210.");
  const exists = await prisma.user.findUnique({ where: { phoneNumber } });
  if (exists) throw new HttpError(409, "A user with this mobile number already exists.");
  const viewer = await prisma.role.upsert({ where: { name: "viewer" }, update: {}, create: { name: "viewer" } });
  const user = await prisma.user.create({ data: { name: body.name, phoneNumber, roleId: viewer.id } });
  await logActivity(prisma, { userId: req.user!.id, entityType: "user", entityId: user.id, action: "created", summary: `added user ${user.name}` });
  res.status(201).json({ id: user.id, name: user.name, active: user.active, role: "viewer", phoneMasked: maskPhone(phoneNumber) });
});

usersRouter.patch("/:id", requireAdmin, async (req, res) => {
  const patch = userUpdateSchema.parse(req.body);
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) }, include: { role: true } });
  if (!target) throw notFound("User not found");
  if (patch.active === false && target.role.name === "admin") throw badRequest("The admin account can't be deactivated.");
  const updated = await prisma.user.update({ where: { id: target.id }, data: patch });
  if (patch.active === false && target.active) await revokeSessionsFor(target.supertokensUserId);
  const action = patch.active === false ? "deactivated" : patch.active === true ? "reactivated" : "updated";
  await logActivity(prisma, { userId: req.user!.id, entityType: "user", entityId: target.id, action: "updated", summary: `${action} user ${updated.name}` });
  res.json({ id: updated.id, name: updated.name, active: updated.active });
});
