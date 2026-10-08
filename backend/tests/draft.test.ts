import { describe, expect, it } from "vitest";
import {
  DraftParseError,
  extractJson,
  matchByName,
  mockLlmReply,
  normalizePriority,
  normalizeStatus,
  parseDraftResponse,
  type DraftContext,
} from "../src/lib/draft.js";

const P_LOGIN = "aaaaaaaa-0000-4000-8000-000000000001";
const P_DS = "aaaaaaaa-0000-4000-8000-000000000002";
const U_RAVI = "bbbbbbbb-0000-4000-8000-000000000001";
const U_MEERA = "bbbbbbbb-0000-4000-8000-000000000002";
const T1 = "cccccccc-0000-4000-8000-000000000001";
const T2 = "cccccccc-0000-4000-8000-000000000002";

const ctx: DraftContext = {
  today: "2026-10-08",
  projects: [
    { id: P_LOGIN, name: "Login Redesign" },
    { id: P_DS, name: "Design System v2" },
  ],
  users: [
    { id: U_RAVI, name: "Ravi Kumar" },
    { id: U_MEERA, name: "Meera Iyer" },
  ],
  tasks: [
    { id: T1, title: "Build OTP input", projectId: P_LOGIN, assigneeId: U_RAVI, status: "IN_PROGRESS", priority: "HIGH", dueDate: null, tags: [] },
    { id: T2, title: "Status pill", projectId: P_DS, assigneeId: U_MEERA, status: "TODO", priority: "MEDIUM", dueDate: "2026-10-12", tags: ["components"] },
  ],
};

describe("extractJson", () => {
  it("reads plain JSON", () => expect(extractJson('{"creates":[]}')).toEqual({ creates: [] }));
  it("reads fenced JSON with chatter", () => expect(extractJson('Sure!\n```json\n{"updates":[]}\n```\nDone')).toEqual({ updates: [] }));
  it("throws on no JSON", () => expect(() => extractJson("I can't help")).toThrow(DraftParseError));
  it("throws on broken JSON", () => expect(() => extractJson("{creates: [}")).toThrow(DraftParseError));
});

describe("normalisers", () => {
  it("maps status spellings", () => {
    expect(normalizeStatus("In Progress")).toBe("IN_PROGRESS");
    expect(normalizeStatus("to-do")).toBe("TODO");
    expect(normalizeStatus("IN_PROGRESS")).toBe("IN_PROGRESS");
    expect(normalizeStatus("nope")).toBeNull();
  });
  it("maps priority spellings", () => {
    expect(normalizePriority("high")).toBe("HIGH");
    expect(normalizePriority("Critical")).toBe("URGENT");
    expect(normalizePriority("whenever")).toBeNull();
  });
  it("matches names by first name, case-insensitively", () => {
    expect(matchByName(ctx.users, "ravi")?.id).toBe(U_RAVI);
    expect(matchByName(ctx.projects, "login redesign")?.id).toBe(P_LOGIN);
    expect(matchByName(ctx.projects, "design system")?.id).toBe(P_DS);
    expect(matchByName(ctx.users, "Arjun")).toBeNull();
  });
});

describe("parseDraftResponse: creates", () => {
  it("resolves names to ids and applies defaults", () => {
    const reply = JSON.stringify({
      creates: [
        { title: "Build mobile number input", project: "Login Redesign", assignee: "Ravi", priority: "High", status: "Backlog", dueDate: "2026-10-15", tags: ["forms", "#A11y"] },
        { title: "Write tests", project: "login redesign" },
      ],
      updates: [],
      message: "Drafted 2 tasks",
    });
    const r = parseDraftResponse(reply, ctx);
    expect(r.creates).toHaveLength(2);
    expect(r.creates[0]).toMatchObject({ projectId: P_LOGIN, assigneeId: U_RAVI, priority: "HIGH", status: "BACKLOG", dueDate: "2026-10-15", tags: ["forms", "a11y"], flags: {} });
    expect(r.creates[1]).toMatchObject({ projectId: P_LOGIN, assigneeId: null, priority: "MEDIUM", status: "BACKLOG", dueDate: null });
    expect(r.message).toBe("Drafted 2 tasks");
  });

  it("flags unknown users, projects and bad dates instead of guessing", () => {
    const r = parseDraftResponse({ creates: [{ title: "X", project: "Mobile App", assignee: "Arjun", dueDate: "next friday", priority: "asap" }] }, ctx);
    const d = r.creates[0];
    expect(d.projectId).toBeNull();
    expect(d.assigneeId).toBeNull();
    expect(d.flags.project).toMatch(/not found/i);
    expect(d.flags.assignee).toMatch(/not found/i);
    expect(d.flags.dueDate).toBeDefined();
    expect(d.flags.priority).toBeDefined();
    expect(d.priority).toBe("MEDIUM");
  });

  it("flags a missing project", () => {
    const r = parseDraftResponse({ creates: [{ title: "No project" }] }, ctx);
    expect(r.creates[0].flags.project).toBe("Pick a project");
  });

  it("skips items without a title and reports a warning", () => {
    const r = parseDraftResponse({ creates: [{ project: "Login Redesign" }, { title: "  " }, { title: "OK", project: "Login Redesign" }] }, ctx);
    expect(r.creates.map((c) => c.title)).toEqual(["OK"]);
    expect(r.warnings).toHaveLength(2);
  });

  it("treats 'unassigned' as no assignee without a flag", () => {
    const r = parseDraftResponse({ creates: [{ title: "Y", project: "Login Redesign", assignee: "unassigned" }] }, ctx);
    expect(r.creates[0].assigneeId).toBeNull();
    expect(r.creates[0].flags.assignee).toBeUndefined();
  });

  it("rejects a reply in the wrong shape", () => {
    expect(() => parseDraftResponse('{"creates": "three tasks"}', ctx)).toThrow(DraftParseError);
  });
});

describe("parseDraftResponse: updates", () => {
  it("builds before/after diffs for existing tasks only", () => {
    const r = parseDraftResponse(
      {
        updates: [
          { taskId: T1, changes: { status: "Review", assignee: "Meera" } },
          { taskId: "dddddddd-0000-4000-8000-000000000000", changes: { status: "Done" } },
        ],
      },
      ctx,
    );
    expect(r.updates).toHaveLength(1);
    expect(r.updates[0]).toMatchObject({
      taskId: T1,
      taskTitle: "Build OTP input",
      before: { status: "IN_PROGRESS", assigneeId: U_RAVI },
      after: { status: "REVIEW", assigneeId: U_MEERA },
    });
    expect(r.warnings[0]).toMatch(/not found/);
  });

  it("drops no-op updates", () => {
    const r = parseDraftResponse({ updates: [{ taskId: T2, changes: { status: "To do" } }] }, ctx);
    expect(r.updates).toHaveLength(0);
    expect(r.warnings[0]).toMatch(/No change/);
  });
});

describe("mock LLM", () => {
  it("drafts N tasks for a project with priority and assignee", () => {
    const r = parseDraftResponse(mockLlmReply("Add 3 tasks for the login page redesign, high priority, assign to Ravi", ctx), ctx);
    expect(r.creates).toHaveLength(3);
    for (const c of r.creates) expect(c).toMatchObject({ projectId: P_LOGIN, assigneeId: U_RAVI, priority: "HIGH", status: "BACKLOG" });
  });
  it("does not confuse 'redesign' with 'Design System'", () => {
    const r = parseDraftResponse(mockLlmReply("Add 2 tasks for the login page redesign", ctx), ctx);
    expect(r.creates.every((c) => c.projectId === P_LOGIN)).toBe(true);
  });
  it("proposes status updates", () => {
    const r = parseDraftResponse(mockLlmReply("Move all Ravi's login tasks to Review", ctx), ctx);
    expect(r.updates).toHaveLength(1);
    expect(r.updates[0].after.status).toBe("REVIEW");
  });
});
