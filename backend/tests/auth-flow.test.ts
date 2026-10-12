/**
 * End-to-end sign-in flow against the real database (skipped when no DATABASE_URL / DB is reachable).
 * Creates its own throw-away user and removes it afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { generate } from "otplib";
import { prisma } from "../src/db.js";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { SESSION_COOKIE } from "../src/auth/session.js";

async function dbAvailable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const hasDb = await dbAvailable();
const app = createApp();
const email = `flow-${randomUUID().slice(0, 8)}@devhub.test`;
const TEMP = "Temp-password-123";
const FINAL = "My-own-password-456";
let userId = "";

describe.skipIf(!hasDb)("sign-in flow: email + password + TOTP (database)", () => {
  beforeAll(async () => {
    const role = await prisma.role.upsert({ where: { name: "viewer" }, update: {}, create: { name: "viewer" } });
    const u = await prisma.user.create({ data: { name: "Flow Test", email, passwordHash: await hashPassword(TEMP), mustChangePassword: true, roleId: role.id } });
    userId = u.id;
  });

  afterAll(async () => {
    if (!userId) return;
    await prisma.activityLog.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const agent = request.agent(app);
  let secret = "";

  it("rejects a wrong password with a generic message", async () => {
    const res = await agent.post("/api/auth/login").send({ email, password: "Wrong-password-1" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Email or password is incorrect.");
    const unknown = await agent.post("/api/auth/login").send({ email: "nobody@devhub.test", password: "Wrong-password-1" });
    expect(unknown.body.error).toBe(res.body.error);
  });

  it("password OK -> TOTP setup; the API is still locked", async () => {
    const res = await agent.post("/api/auth/login").send({ email: email.toUpperCase(), password: TEMP });
    expect(res.status).toBe(200);
    expect(res.body.step).toBe("totp_setup");
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect((await agent.get("/api/me")).status).toBe(401);
  });

  it("shows a QR code and stores the secret encrypted (not yet on the user)", async () => {
    const res = await agent.post("/api/auth/totp/setup");
    expect(res.status).toBe(200);
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(res.body.otpauthUri).toContain(encodeURIComponent(email));
    secret = res.body.secret;
    const again = await agent.post("/api/auth/totp/setup");
    expect(again.body.secret).toBe(secret); // stable across reloads
    const session = await prisma.session.findFirst({ where: { userId } });
    expect(session?.pendingTotpSecretEnc).toBeTruthy();
    expect(session?.pendingTotpSecretEnc).not.toContain(secret);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.totpEnabled).toBe(false);
  });

  it("confirms enrolment with a valid code, then asks for a new password", async () => {
    expect((await agent.post("/api/auth/totp/enable").send({ code: "000000" })).status).toBe(400);
    const res = await agent.post("/api/auth/totp/enable").send({ code: await generate({ secret }) });
    expect(res.status).toBe(200);
    expect(res.body.step).toBe("set_password");
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.totpEnabled).toBe(true);
    expect(user?.totpSecretEnc).toBeTruthy();
    expect(user?.totpSecretEnc).not.toContain(secret);
    expect((await agent.get("/api/me")).status).toBe(401); // still locked until the password is changed
  });

  it("requires a strong, different password", async () => {
    expect((await agent.post("/api/auth/password").send({ newPassword: "short" })).status).toBe(400);
    expect((await agent.post("/api/auth/password").send({ newPassword: TEMP })).status).toBe(400);
    const res = await agent.post("/api/auth/password").send({ newPassword: FINAL });
    expect(res.status).toBe(200);
    expect(res.body.step).toBe("done");
    const me = await agent.get("/api/me");
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email, role: "viewer" });
    // viewers can't add items in any work section...
    for (const path of ["tasks", "roadmap", "rnd", "poc"]) expect((await agent.post(`/api/${path}`).send({ title: "x" })).status).toBe(403);
    // ...but they can change the status of an item in every section (and only through its own section's URL)
    for (const [type, path] of [["TASK", "tasks"], ["ROADMAP", "roadmap"], ["RND", "rnd"], ["POC", "poc"]] as const) {
      const item = await prisma.workItem.findFirst({ where: { type }, select: { id: true, status: true } });
      if (!item) continue;
      const next = item.status === "DONE" ? "HOLD" : "DONE";
      const res = await agent.patch(`/api/${path}/${item.id}/status`).send({ status: next });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(next);
      const wrongSection = path === "tasks" ? "poc" : "tasks";
      expect((await agent.patch(`/api/${wrongSection}/${item.id}/status`).send({ status: "TODO" })).status).toBe(404);
      await prisma.workItem.update({ where: { id: item.id }, data: { status: item.status } });
    }
    await prisma.activityLog.deleteMany({ where: { userId } });
  });

  it("signs out", async () => {
    expect((await agent.post("/api/auth/logout")).status).toBe(204);
    expect((await agent.get("/api/me")).status).toBe(401);
  });

  it("later logins need password + TOTP; old password and replayed codes fail", async () => {
    expect((await agent.post("/api/auth/login").send({ email, password: TEMP })).status).toBe(401);
    const res = await agent.post("/api/auth/login").send({ email, password: FINAL });
    expect(res.body.step).toBe("totp_verify");
    expect((await agent.post("/api/auth/totp/setup")).status).toBe(409); // can't re-enrol without an admin reset
    // The code used during enrolment (same 30 s step) must not work again.
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const usedStep = user!.totpLastStep!;
    const replay = await generate({ secret, epoch: usedStep * 30 });
    expect((await agent.post("/api/auth/totp/verify").send({ code: replay })).status).toBe(400);
    const next = await generate({ secret, epoch: (usedStep + 1) * 30 });
    const ok = await agent.post("/api/auth/totp/verify").send({ code: next });
    expect(ok.status).toBe(200);
    expect(ok.body.step).toBe("done");
    expect((await agent.get("/api/me")).status).toBe(200);
  });

  it("deactivation kills the session immediately", async () => {
    await prisma.user.update({ where: { id: userId }, data: { active: false } });
    expect((await agent.get("/api/me")).status).toBe(401);
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    const res = await request(app).post("/api/auth/login").send({ email, password: FINAL });
    expect(res.status).toBe(403);
    await prisma.user.update({ where: { id: userId }, data: { active: true } });
  });

  it("locks the pending login after 5 wrong codes", async () => {
    const a = request.agent(app);
    await a.post("/api/auth/login").send({ email, password: FINAL });
    for (let i = 0; i < 4; i++) expect((await a.post("/api/auth/totp/verify").send({ code: "000000" })).status).toBe(400);
    const fifth = await a.post("/api/auth/totp/verify").send({ code: "000000" });
    expect(fifth.status).toBe(401);
    expect(fifth.body.error).toMatch(/sign in again/i);
  });

  it("rate-limits repeated wrong passwords for an email (429)", async () => {
    const victim = `nobody-${randomUUID().slice(0, 6)}@devhub.test`;
    const statuses: number[] = [];
    for (let i = 0; i < 9; i++) statuses.push((await request(app).post("/api/auth/login").send({ email: victim, password: "Wrong-password-1" })).status);
    expect(statuses.slice(0, 8).every((s) => s === 401)).toBe(true);
    expect(statuses[8]).toBe(429);
  });
});
