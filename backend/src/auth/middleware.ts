import type { RequestHandler } from "express";
import { forbidden, HttpError } from "../lib/errors.js";
import type { RoleName } from "../types.js";
import { clearSessionCookie, getSession, revokeUserSessions } from "./session.js";

/**
 * Default authentication for /api/*: a session cookie that has completed password + TOTP (and any
 * required password change), belonging to an active user. Sets req.user.
 */
export const sessionAuthenticate: RequestHandler = async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (!session) throw new HttpError(401, "Not signed in");
    const { user } = session;
    if (!user.active) {
      await revokeUserSessions(user.id);
      clearSessionCookie(res);
      throw new HttpError(401, "Your account has been deactivated.");
    }
    if (!session.mfaVerified || user.mustChangePassword) throw new HttpError(401, "Finish signing in first.");
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role.name as RoleName };
    next();
  } catch (e) {
    next(e);
  }
};

/** Every create / edit / delete endpoint is wrapped with this. Viewers get 403. */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, "Not signed in"));
  if (req.user.role !== "admin") return next(forbidden());
  next();
};
