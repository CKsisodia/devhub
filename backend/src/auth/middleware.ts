import type { RequestHandler } from "express";
import { verifySession } from "supertokens-node/recipe/session/framework/express";
import type { SessionRequest } from "supertokens-node/framework/express";
import { prisma } from "../db.js";
import { forbidden, HttpError } from "../lib/errors.js";
import type { AuthUser, RoleName } from "../types.js";

/** Loads the app user for a SuperTokens user id; rejects unknown or deactivated accounts. */
export async function loadAuthUser(supertokensUserId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { supertokensUserId }, include: { role: true } });
  if (!user) throw new HttpError(401, "Account not found");
  if (!user.active) throw new HttpError(401, "Your account has been deactivated.");
  return { id: user.id, name: user.name, phoneNumber: user.phoneNumber, role: user.role.name as RoleName };
}

/** Default authentication: SuperTokens session cookie -> app user (with role) on req.user. */
export function supertokensAuthenticate(): RequestHandler {
  const verify = verifySession();
  return (req, res, next) => {
    verify(req as SessionRequest, res, async (err?: unknown) => {
      if (err) return next(err);
      try {
        const session = (req as SessionRequest).session!;
        try {
          req.user = await loadAuthUser(session.getUserId());
        } catch (e) {
          // Deactivated / removed users lose their session immediately.
          await session.revokeSession();
          throw e;
        }
        next();
      } catch (e) {
        next(e);
      }
    });
  };
}

/** Every create / edit / delete endpoint is wrapped with this. Viewers get 403. */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, "Not signed in"));
  if (req.user.role !== "admin") return next(forbidden());
  next();
};
