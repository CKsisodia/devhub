/**
 * Permission checks: every mutating API route must return 403 for a viewer.
 * Routes are discovered from the routers themselves, so new routes are covered automatically.
 * These tests don't touch the database: the admin check runs before any data access.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import type { RequestHandler, Router } from "express";
import { apiMounts, createApp, VIEWER_ALLOWED_MUTATIONS } from "../src/app.js";
import type { AuthUser } from "../src/types.js";

const ADMIN: AuthUser = { id: "00000000-0000-4000-8000-000000000001", name: "Test Admin", email: "admin@devhub.test", role: "admin" };
const VIEWER: AuthUser = { id: "00000000-0000-4000-8000-000000000002", name: "Test Viewer", email: "viewer@devhub.test", role: "viewer" };

/** Test auth: "x-test-user: admin|viewer" header, otherwise 401. */
const fakeAuth: RequestHandler = (req, res, next) => {
  const who = req.header("x-test-user");
  if (who === "admin") req.user = ADMIN;
  else if (who === "viewer") req.user = VIEWER;
  else return res.status(401).json({ error: "Not signed in" });
  next();
};

const app = createApp({ authenticate: fakeAuth });

type RouteLayer = { route?: { path: string; methods: Record<string, boolean> } };

function mutatingRoutes() {
  const out: { method: string; path: string }[] = [];
  for (const [mount, router] of apiMounts) {
    for (const layer of (router as Router & { stack: RouteLayer[] }).stack) {
      if (!layer.route) continue;
      for (const method of Object.keys(layer.route.methods)) {
        if (["post", "put", "patch", "delete"].includes(method)) {
          const path = `/api${mount}${layer.route.path === "/" ? "" : layer.route.path}`.replace(/:[A-Za-z]+/g, "11111111-1111-4111-8111-111111111111");
          out.push({ method, path });
        }
      }
    }
  }
  return out;
}

const all = mutatingRoutes();
const ID = "11111111-1111-4111-8111-111111111111";
const SECTIONS = ["tasks", "roadmap", "rnd", "poc"];
const STATUS_ROUTES = SECTIONS.map((s) => ({ method: "patch", path: `/api/${s}/${ID}/status` }));
const STATUS_ROUTE = STATUS_ROUTES[0];
const viewerAllowed = (r: { method: string; path: string }) =>
  VIEWER_ALLOWED_MUTATIONS.some((m) => m.method.toLowerCase() === r.method && m.pattern.test(r.path.replace(/^\/api/, "")));
/** Every mutating route except the viewer allow-list (status change in the four work sections). */
const routes = all.filter((r) => !viewerAllowed(r));

describe("permissions", () => {
  it("discovers all mutating routes", () => {
    // users(4) + 4 work sections x 5 + ai(1) + projects(5) + learning(3) + docs(3) + uploads(1)
    expect(all.length).toBeGreaterThanOrEqual(37);
    expect(routes.length).toBe(all.length - 4);
    for (const s of SECTIONS) {
      expect(routes).toContainEqual({ method: "post", path: `/api/${s}` });
      expect(routes).toContainEqual({ method: "post", path: `/api/${s}/bulk` });
      expect(routes).toContainEqual({ method: "patch", path: `/api/${s}/${ID}` });
      expect(routes).toContainEqual({ method: "delete", path: `/api/${s}/${ID}` });
    }
    expect(routes).toContainEqual({ method: "post", path: `/api/users/${ID}/reset-totp` });
    expect(routes).toContainEqual({ method: "post", path: `/api/users/${ID}/reset-password` });
    expect(routes).toContainEqual({ method: "post", path: "/api/ai/draft" });
  });

  it.each(routes)("viewer gets 403 on $method $path", async ({ method, path }) => {
    const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method](path)
      .set("x-test-user", "viewer")
      .send({ title: "x", name: "x", prompt: "add a task", projectId: null });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin only|read-only/i);
  });

  it.each(routes)("unauthenticated request gets 401 on $method $path", async ({ method, path }) => {
    const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it("admin passes the permission check (reaches validation)", async () => {
    for (const s of SECTIONS) expect((await request(app).post(`/api/${s}`).set("x-test-user", "admin").send({})).status).toBe(400);
  });

  it("admin can't send fields that don't belong to a section (reaches validation, 400)", async () => {
    const res = await request(app).post("/api/tasks").set("x-test-user", "admin").send({ title: "x", outcome: "ADOPT" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/outcome/);
  });

  it("viewer cannot open another user's dashboard", async () => {
    const res = await request(app).get(`/api/dashboard?userId=${ADMIN.id}`).set("x-test-user", "viewer");
    expect(res.status).toBe(403);
  });

  it("viewer is blocked even on an unknown mutating path", async () => {
    const res = await request(app).put("/api/tasks/anything").set("x-test-user", "viewer").send({});
    expect(res.status).toBe(403);
  });

  it("the ONLY mutations open to viewers are the status changes in Tasks, Roadmap, R&D and POC", () => {
    expect(all.filter(viewerAllowed)).toEqual(STATUS_ROUTES);
  });

  it.each(STATUS_ROUTES)("viewer passes the permission check for a status change on $path (reaches validation)", async ({ path }) => {
    const res = await request(app).patch(path).set("x-test-user", "viewer").send({ status: "SHIPPED" });
    expect(res.status).toBe(400);
  });

  it.each(SECTIONS)("viewer still can't change status through the full edit endpoint of %s", async (s) => {
    const res = await request(app).patch(`/api/${s}/${ID}`).set("x-test-user", "viewer").send({ status: "DONE" });
    expect(res.status).toBe(403);
  });

  it("the old /api/backlog routes are gone", async () => {
    expect((await request(app).get("/api/backlog").set("x-test-user", "admin")).status).toBe(404);
  });

  it("status change still requires sign-in", async () => {
    expect((await request(app).patch(STATUS_ROUTE.path).send({ status: "DONE" })).status).toBe(401);
  });

  it("sign-in routes are reachable without a session (validation runs, no 401)", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
  });

  it("blocks cross-site mutating requests by Origin", async () => {
    const res = await request(app).post("/api/tasks").set("x-test-user", "admin").set("Origin", "https://evil.example").send({ title: "x" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/cross-site/i);
  });
});
