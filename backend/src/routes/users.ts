import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/middleware.js";
import { revokeUserSessions } from "../auth/session.js";
import { logActivity } from "../lib/activity.js";
import { badRequest, HttpError, notFound } from "../lib/errors.js";
import { hashPassword, passwordProblem } from "../lib/password.js";
import { userCreateSchema, userResetPasswordSchema, userUpdateSchema } from "../lib/schemas.js";

export const usersRouter = Router();

type UserRow = Prisma.UserGetPayload<{ include: { role: true } }>;
const findUser = (id: string) => prisma.user.findUnique({ where: { id }, include: { role: true } });

const adminView = (u: UserRow) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  active: u.active,
  role: u.role.name,
  totpEnabled: u.totpEnabled,
  mustChangePassword: u.mustChangePassword,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
});

async function loadTarget(id: string, actingUserId: string, action: string) {
  const target = await findUser(id);
  if (!target) throw notFound("User not found");
  if (target.id === actingUserId) throw badRequest(`You can't ${action} your own account here. See the README (account recovery).`);
  return target;
}

usersRouter.get("/", async (req, res) => {
  const users = await prisma.user.findMany({ include: { role: true }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  if (req.user!.role !== "admin") {
    // Viewers: names only (needed to show creators / members).
    return res.json(users.map((u) => ({ id: u.id, name: u.name, active: u.active })));
  }
  res.json(users.map(adminView));
});

/** Admin adds a viewer with a temporary password; they must change it (and enrol TOTP) on first login. */
usersRouter.post("/", requireAdmin, async (req, res) => {
  const body = userCreateSchema.parse(req.body);
  const problem = passwordProblem(body.tempPassword);
  if (problem) throw badRequest(`Temporary password: ${problem}`);
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw new HttpError(409, "A user with this email already exists.");
  const viewer = await prisma.role.upsert({ where: { name: "viewer" }, update: {}, create: { name: "viewer" } });
  const user = await prisma.user.create({
    data: { name: body.name, email: body.email, passwordHash: await hashPassword(body.tempPassword), mustChangePassword: true, roleId: viewer.id },
    include: { role: true },
  });
  await logActivity(prisma, { userId: req.user!.id, entityType: "user", entityId: user.id, action: "created", summary: `added user ${user.name}` });
  res.status(201).json(adminView(user));
});

usersRouter.patch("/:id", requireAdmin, async (req, res) => {
  const patch = userUpdateSchema.parse(req.body);
  const target = await findUser(String(req.params.id));
  if (!target) throw notFound("User not found");
  if (patch.active === false && target.role.name === "admin") throw badRequest("The admin account can't be deactivated.");
  if (patch.email && patch.email !== target.email && (await prisma.user.findUnique({ where: { email: patch.email } }))) {
    throw new HttpError(409, "A user with this email already exists.");
  }
  const updated = await prisma.user.update({ where: { id: target.id }, data: patch, include: { role: true } });
  if (patch.active === false && target.active) await revokeUserSessions(target.id);
  const action = patch.active === false ? "deactivated" : patch.active === true ? "reactivated" : "updated";
  await logActivity(prisma, { userId: req.user!.id, entityType: "user", entityId: target.id, action: "updated", summary: `${action} user ${updated.name}` });
  res.json(adminView(updated));
});

/** Sets a new temporary password; the user must choose their own at next sign-in. Signs them out everywhere. */
usersRouter.post("/:id/reset-password", requireAdmin, async (req, res) => {
  const { tempPassword } = userResetPasswordSchema.parse(req.body);
  const problem = passwordProblem(tempPassword);
  if (problem) throw badRequest(`Temporary password: ${problem}`);
  const target = await loadTarget(String(req.params.id), req.user!.id, "reset the password of");
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true },
    include: { role: true },
  });
  await revokeUserSessions(target.id);
  await logActivity(prisma, { userId: req.user!.id, entityType: "user", entityId: target.id, action: "updated", summary: `reset the password of ${target.name}` });
  res.json(adminView(updated));
});

/** Removes the user's authenticator; they scan a new QR code at next sign-in. Signs them out everywhere. */
usersRouter.post("/:id/reset-totp", requireAdmin, async (req, res) => {
  const target = await loadTarget(String(req.params.id), req.user!.id, "reset two-factor for");
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { totpEnabled: false, totpSecretEnc: null, totpLastStep: null },
    include: { role: true },
  });
  await revokeUserSessions(target.id);
  await logActivity(prisma, { userId: req.user!.id, entityType: "user", entityId: target.id, action: "updated", summary: `reset two-factor for ${target.name}` });
  res.json(adminView(updated));
});
