import express, { type ErrorRequestHandler, type RequestHandler, type Router } from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { config } from "./config.js";
import { HttpError, forbidden } from "./lib/errors.js";
import { authRouter } from "./auth/routes.js";
import { sessionAuthenticate } from "./auth/middleware.js";
import { meRouter } from "./routes/me.js";
import { usersRouter } from "./routes/users.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { workItemsRouter } from "./routes/workItems.js";
import { WORK_TYPE_META, WORK_TYPES } from "./lib/workTypes.js";
import { aiRouter } from "./routes/ai.js";
import { projectsRouter } from "./routes/projects.js";
import { learningRouter } from "./routes/learning.js";
import { docsRouter } from "./routes/docs.js";
import { uploadsRouter } from "./routes/uploads.js";

/** All authenticated API routers and their mount paths (under /api). Exported for the permission tests. */
export const apiMounts: [string, Router][] = [
  ["/me", meRouter],
  ["/users", usersRouter],
  ["/dashboard", dashboardRouter],
  // Tasks, Roadmap, R&D, POC: one generic router per section
  ...WORK_TYPES.map((t) => [`/${WORK_TYPE_META[t].path}`, workItemsRouter(t)] as [string, Router]),
  ["/ai", aiRouter],
  ["/projects", projectsRouter],
  ["/learning", learningRouter],
  ["/docs", docsRouter],
  ["/uploads", uploadsRouter],
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const WORK_PATHS = WORK_TYPES.map((t) => WORK_TYPE_META[t].path).join("|");

/**
 * The ONLY mutations a viewer may make (product decision, requirements v1.2/v1.3): changing the status of
 * an item in Tasks, Roadmap, R&D or POC. Everything else that writes is admin-only.
 */
export const VIEWER_ALLOWED_MUTATIONS: { method: string; pattern: RegExp }[] = [{ method: "PATCH", pattern: new RegExp(`^/(${WORK_PATHS})/[^/]+/status/?$`) }];

/**
 * Defence in depth: viewers are read-only everywhere except the allow-list above, so any other mutating
 * request from a non-admin is rejected before it reaches a route. Admin-only routes are additionally
 * wrapped in requireAdmin.
 */
export const readOnlyForViewers: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method) || req.user?.role === "admin") return next();
  if (VIEWER_ALLOWED_MUTATIONS.some((m) => m.method === req.method && m.pattern.test(req.path))) return next();
  next(forbidden());
};

/**
 * CSRF defence in depth (on top of SameSite=Lax cookies): browsers send Origin on cross-site mutating
 * requests, so reject any whose Origin isn't the frontend (or an explicitly allowed origin).
 */
export const sameOriginForMutations: RequestHandler = (req, _res, next) => {
  const origin = req.header("origin");
  if (SAFE_METHODS.has(req.method) || !origin) return next();
  const allowed = new Set([config.websiteDomain, ...config.corsOrigins, `${req.protocol}://${req.get("host")}`]);
  if (!allowed.has(origin)) return next(new HttpError(403, "Cross-site request blocked."));
  next();
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  void _next;
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path.join(".");
    return res.status(400).json({ error: field ? `${field}: ${first.message}` : (first?.message ?? "Invalid input"), issues: err.issues });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 5 MB)." : err.message });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return res.status(404).json({ error: "Not found" });
    if (err.code === "P2002") return res.status(409).json({ error: "Already exists" });
    if (err.code === "P2023") return res.status(400).json({ error: "Invalid id" });
  }
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
};

export interface AppOptions {
  /** Sets req.user or fails with 401. Defaults to the session cookie; tests inject a fake. */
  authenticate?: RequestHandler;
}

export function createApp(opts: AppOptions = {}) {
  const app = express();
  app.disable("x-powered-by");
  // Render (and similar hosts) put exactly one proxy in front of the app. Trusting only that hop means
  // req.ip / req.protocol can't be spoofed with a client-supplied X-Forwarded-For. Locally: no proxy.
  if (config.isProd) app.set("trust proxy", 1);
  // JSON API: strict CSP, no framing, nosniff, no referrer, HSTS (helmet defaults) in production.
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-origin" },
      referrerPolicy: { policy: "no-referrer" },
      strictTransportSecurity: config.isProd,
    }),
  );

  app.use(cors({ origin: [config.websiteDomain, ...config.corsOrigins], credentials: true, allowedHeaders: ["content-type"] }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", sameOriginForMutations);
  app.use("/api/auth", authRouter);

  const api = express.Router();
  api.use(opts.authenticate ?? sessionAuthenticate);
  api.use(readOnlyForViewers);
  for (const [path, router] of apiMounts) api.use(path, router);
  api.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use("/api", api);

  app.use(errorHandler);
  return app;
}
