/**
 * Email + password + TOTP sign-in.
 *
 *   POST /api/auth/login          { email, password }       -> step
 *   GET  /api/auth/state                                     -> step (resume after reload)
 *   POST /api/auth/totp/setup                                -> { qrDataUrl, secret, otpauthUri }  (first login)
 *   POST /api/auth/totp/enable    { code }                   -> step  (confirms enrolment)
 *   POST /api/auth/totp/verify    { code }                   -> step  (every later login)
 *   POST /api/auth/password       { newPassword }            -> step  (after an admin-set temporary password)
 *   POST /api/auth/logout
 *
 * step: "totp_setup" | "totp_verify" | "set_password" | "done"
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { HttpError } from "../lib/errors.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { burnPasswordCheck, hashPassword, passwordProblem, verifyPassword } from "../lib/password.js";
import { RateLimiter } from "../lib/rateLimit.js";
import { checkTotp, newTotpSecret, totpQrDataUrl, totpUri } from "../lib/totp.js";
import { logActivity } from "../lib/activity.js";
import {
  clearSessionCookie,
  createPendingSession,
  destroySession,
  getSession,
  revokeUserSessions,
  rotateSession,
  type SessionWithUser,
} from "./session.js";

export type LoginStep = "totp_setup" | "totp_verify" | "set_password" | "done";

export const INVALID_LOGIN = "Email or password is incorrect.";
export const DEACTIVATED = "Your account has been deactivated. Contact your admin.";
export const WRONG_CODE = "That code didn't match. Check your authenticator app and try again.";
const MAX_TOTP_PER_SESSION = 5;

const windowMs = () => config.auth.rateLimitWindowMinutes * 60_000;
export const limiters = {
  loginEmail: new RateLimiter(config.auth.loginMaxAttempts, windowMs()),
  loginIp: new RateLimiter(config.auth.loginMaxAttempts * 4, windowMs()),
  totpUser: new RateLimiter(10, windowMs()),
};

const loginSchema = z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().min(1).max(256) });
const codeSchema = z.object({ code: z.string().trim().min(6).max(8) });
const newPasswordSchema = z.object({ newPassword: z.string().max(256) });

export function stepFor(s: { mfaVerified: boolean; user: { totpEnabled: boolean; mustChangePassword: boolean } }): LoginStep {
  if (!s.mfaVerified) return s.user.totpEnabled ? "totp_verify" : "totp_setup";
  if (s.user.mustChangePassword) return "set_password";
  return "done";
}

function limited(seconds: number, res: Response): never {
  res.setHeader("Retry-After", String(seconds));
  throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(seconds / 60)} min.`);
}

function reply(res: Response, s: SessionWithUser) {
  res.json({ step: stepFor(s), user: { name: s.user.name, email: s.user.email } });
}

/** The in-progress login for this request (any step). */
async function loginSession(req: Request, res: Response): Promise<SessionWithUser> {
  const s = await getSession(req);
  if (!s) throw new HttpError(401, "Your sign-in expired. Please start again.");
  if (!s.user.active) {
    await revokeUserSessions(s.user.id);
    clearSessionCookie(res);
    throw new HttpError(403, DEACTIVATED);
  }
  return s;
}

async function wrongCode(res: Response, s: SessionWithUser): Promise<never> {
  limiters.totpUser.hit(s.userId);
  const updated = await prisma.session.update({ where: { id: s.id }, data: { failedTotpAttempts: { increment: 1 } } });
  if (updated.failedTotpAttempts >= MAX_TOTP_PER_SESSION) {
    await destroySession(s.id);
    clearSessionCookie(res);
    throw new HttpError(401, "Too many wrong codes. Please sign in again.");
  }
  throw new HttpError(400, WRONG_CODE);
}

async function finishIfDone(s: SessionWithUser) {
  if (stepFor(s) === "done") {
    await prisma.user.update({ where: { id: s.userId }, data: { lastLoginAt: new Date() } });
    limiters.totpUser.reset(s.userId);
  }
}

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const ipKey = req.ip ?? "unknown";
  const wait = Math.max(limiters.loginEmail.retryAfter(email), limiters.loginIp.retryAfter(ipKey));
  if (wait) limited(wait, res);

  const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });
  const ok = user ? await verifyPassword(user.passwordHash, password) : (await burnPasswordCheck(password), false);
  if (!user || !ok) {
    limiters.loginEmail.hit(email);
    limiters.loginIp.hit(ipKey);
    throw new HttpError(401, INVALID_LOGIN);
  }
  if (!user.active) throw new HttpError(403, DEACTIVATED);
  limiters.loginEmail.reset(email);
  const session = await createPendingSession(res, user.id);
  reply(res, session);
});

authRouter.get("/state", async (req, res) => {
  const s = await getSession(req);
  if (!s || !s.user.active) return res.status(401).json({ error: "Not signed in", step: "login" });
  reply(res, s);
});

authRouter.post("/totp/setup", async (req, res) => {
  const s = await loginSession(req, res);
  if (s.mfaVerified || s.user.totpEnabled) throw new HttpError(409, "Two-factor authentication is already set up.");
  // Keep the same secret across reloads of the setup screen, so a half-finished scan still works.
  const secret = s.pendingTotpSecretEnc ? decryptSecret(s.pendingTotpSecretEnc) : newTotpSecret();
  if (!s.pendingTotpSecretEnc) await prisma.session.update({ where: { id: s.id }, data: { pendingTotpSecretEnc: encryptSecret(secret) } });
  const otpauthUri = totpUri(s.user.email, secret);
  res.json({ otpauthUri, secret, qrDataUrl: await totpQrDataUrl(otpauthUri), issuer: config.auth.totpIssuer, account: s.user.email });
});

authRouter.post("/totp/enable", async (req, res) => {
  const { code } = codeSchema.parse(req.body);
  const s = await loginSession(req, res);
  if (s.mfaVerified || s.user.totpEnabled) throw new HttpError(409, "Two-factor authentication is already set up.");
  if (!s.pendingTotpSecretEnc) throw new HttpError(400, "Scan the QR code first.");
  const wait = limiters.totpUser.retryAfter(s.userId);
  if (wait) limited(wait, res);
  const secret = decryptSecret(s.pendingTotpSecretEnc);
  const step = await checkTotp(secret, code);
  if (step === null) return await wrongCode(res, s);
  await prisma.user.update({ where: { id: s.userId }, data: { totpEnabled: true, totpSecretEnc: s.pendingTotpSecretEnc, totpLastStep: step } });
  const next = await rotateSession(res, s.id, { mfaVerified: true, pendingTotpSecretEnc: null, failedTotpAttempts: 0 }, !s.user.mustChangePassword);
  await logActivity(prisma, { userId: s.userId, entityType: "user", entityId: s.userId, action: "updated", summary: `${s.user.name} set up two-factor authentication` });
  await finishIfDone(next);
  reply(res, next);
});

authRouter.post("/totp/verify", async (req, res) => {
  const { code } = codeSchema.parse(req.body);
  const s = await loginSession(req, res);
  if (s.mfaVerified) return reply(res, s);
  if (!s.user.totpEnabled || !s.user.totpSecretEnc) throw new HttpError(409, "Set up two-factor authentication first.");
  const wait = limiters.totpUser.retryAfter(s.userId);
  if (wait) limited(wait, res);
  const step = await checkTotp(decryptSecret(s.user.totpSecretEnc), code, s.user.totpLastStep);
  if (step === null) return await wrongCode(res, s);
  await prisma.user.update({ where: { id: s.userId }, data: { totpLastStep: step } });
  const next = await rotateSession(res, s.id, { mfaVerified: true, failedTotpAttempts: 0 }, !s.user.mustChangePassword);
  await finishIfDone(next);
  reply(res, next);
});

authRouter.post("/password", async (req, res) => {
  const { newPassword } = newPasswordSchema.parse(req.body);
  const s = await loginSession(req, res);
  if (!s.mfaVerified) throw new HttpError(401, "Enter your authenticator code first.");
  if (!s.user.mustChangePassword) throw new HttpError(409, "No password change is needed.");
  const problem = passwordProblem(newPassword, s.user.email);
  if (problem) throw new HttpError(400, problem);
  if (await verifyPassword(s.user.passwordHash, newPassword)) throw new HttpError(400, "Choose a password different from the temporary one.");
  await prisma.user.update({ where: { id: s.userId }, data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false } });
  await revokeUserSessions(s.userId, s.id);
  const next = await rotateSession(res, s.id, {}, true);
  await finishIfDone(next);
  reply(res, next);
});

authRouter.post("/logout", async (req, res) => {
  const s = await getSession(req);
  if (s) await destroySession(s.id);
  clearSessionCookie(res);
  res.status(204).end();
});
