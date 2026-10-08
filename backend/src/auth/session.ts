import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { newToken, sha256 } from "../lib/crypto.js";

/** httpOnly cookie holding a random session token (the DB stores only its SHA-256). */
export const SESSION_COOKIE = "devhub_session";

const sessionInclude = { user: { include: { role: true } } } satisfies Prisma.SessionInclude;
export type SessionWithUser = Prisma.SessionGetPayload<{ include: typeof sessionInclude }>;

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: config.auth.cookieSecure, sameSite: "lax", path: "/" });
}

const pendingExpiry = () => new Date(Date.now() + config.auth.pendingTtlMinutes * 60_000);
const fullExpiry = () => new Date(Date.now() + config.auth.sessionTtlHours * 3600_000);

/** Starts a login after a correct password: the session is not usable for the API until TOTP succeeds. */
export async function createPendingSession(res: Response, userId: string) {
  const token = newToken();
  const expiresAt = pendingExpiry();
  await prisma.session.deleteMany({ where: { userId, mfaVerified: false } });
  const session = await prisma.session.create({ data: { userId, tokenHash: sha256(token), expiresAt }, include: sessionInclude });
  setSessionCookie(res, token, expiresAt);
  return session;
}

/** Returns the session for the request's cookie, or null if missing / expired. */
export async function getSession(req: Request): Promise<SessionWithUser | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: sessionInclude });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session;
}

/**
 * Issues a fresh token for an existing session (prevents session fixation after each auth step).
 * `full` = password + TOTP done and no password change pending, so the long lifetime applies.
 */
export async function rotateSession(res: Response, sessionId: string, data: Prisma.SessionUpdateInput, full: boolean) {
  const token = newToken();
  const expiresAt = full ? fullExpiry() : pendingExpiry();
  const session = await prisma.session.update({
    where: { id: sessionId },
    data: { ...data, tokenHash: sha256(token), expiresAt },
    include: sessionInclude,
  });
  setSessionCookie(res, token, expiresAt);
  return session;
}

export async function destroySession(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

/** Signs a user out everywhere (deactivation, password / TOTP reset). */
export async function revokeUserSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
}
