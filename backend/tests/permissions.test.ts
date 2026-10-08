/**
 * Permission checks: every mutating API route must return 403 for a viewer.
 * Routes are discovered from the routers themselves, so new routes are covered automatically.
 * These tests don't touch the database: the admin check runs before any data access.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import type { RequestHandler, Router } from "express";
import { apiMounts, createApp } from "../src/app.js";
import type { AuthUser } from "../src/types.js";

const ADMIN: AuthUser = { id: "00000000-0000-4000-8000-000000000001", name: "Test Admin", phoneNumber: "+919876500001", role: "admin" };
const VIEWER: AuthUser = { id: "00000000-0000-4000-8000-000000000002", name: "Test Viewer", phoneNumber: "+919876500002", role: "viewer" };

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

const routes = mutatingRoutes();

describe("permissions", () => {
  it("discovers all mutating routes", () => {
    // users(2) + tasks(4) + ai(1) + projects(5) + learning(3) + docs(3) + uploads(1)
    expect(routes.length).toBeGreaterThanOrEqual(19);
    expect(routes).toContainEqual({ method: "post", path: "/api/tasks/bulk" });
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
    const res = await request(app).post("/api/tasks").set("x-test-user", "admin").send({});
    expect(res.status).toBe(400);
  });

  it("viewer cannot open another user's dashboard", async () => {
    const res = await request(app).get(`/api/dashboard?userId=${ADMIN.id}`).set("x-test-user", "viewer");
    expect(res.status).toBe(403);
  });

  it("viewer is blocked even on an unknown mutating path", async () => {
    const res = await request(app).put("/api/tasks/anything").set("x-test-user", "viewer").send({});
    expect(res.status).toBe(403);
  });
});
