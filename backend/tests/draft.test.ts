import { describe, expect, it } from "vitest";
import { DraftParseError, extractJson, matchByName, mockLlmReply, normalizeStatus, parseDraftResponse, type DraftContext } from "../src/lib/draft.js";

const P_LOGIN = "aaaaaaaa-0000-4000-8000-000000000001";
const P_DS = "aaaaaaaa-0000-4000-8000-000000000002";
const I1 = "cccccccc-0000-4000-8000-000000000001";
const I2 = "cccccccc-0000-4000-8000-000000000002";
const I3 = "cccccccc-0000-4000-8000-000000000003";

const ctx: DraftContext = {
  today: "2026-10-08",
  projects: [
    { id: P_LOGIN, name: "Login Redesign" },
    { id: P_DS, name: "Design System v2" },
  ],
  items: [
    { id: I1, title: "6-box code input", projectId: P_LOGIN, status: "IN_PROGRESS" },
    { id: I2, title: "Status pill", projectId: P_DS, status: "HOLD" },
    { id: I3, title: "Upgrade Next.js", projectId: null, status: "IN_PROGRESS" },
  ],
};

describe("extractJson", () => {
  it("reads plain JSON", () => expect(extractJson('{"creates":[]}')).toEqual({ creates: [] }));
  it("reads fenced JSON with chatter", () => expect(extractJson('Sure!\n```json\n{"updates":[]}\n```\nDone')).toEqual({ updates: [] }));
  it("throws on no JSON", () => expect(() => extractJson("I can't help")).toThrow(DraftParseError));
  it("throws on broken JSON", () => expect(() => extractJson("{creates: [}")).toThrow(DraftParseError));
});

describe("normalizeStatus", () => {
  it.each([
    ["In Progress", "IN_PROGRESS"],
    ["IN_PROGRESS", "IN_PROGRESS"],
    ["wip", "IN_PROGRESS"],
    ["on hold", "HOLD"],
    ["Hold", "HOLD"],
    ["blocked", "HOLD"],
    ["done", "DONE"],
    ["Completed", "DONE"],
    ["rejected", "REJECT"],
    ["won't do", "REJECT"],
    ["cancelled", "REJECT"],
  ])("%s -> %s", (input, expected) => expect(normalizeStatus(input)).toBe(expected));
  it("returns null for unknown / empty", () => {
    expect(normalizeStatus("review")).toBeNull();
    expect(normalizeStatus("")).toBeNull();
    expect(normalizeStatus(null)).toBeNull();
  });
});

describe("matchByName", () => {
  it("matches case-insensitively, by prefix and substring", () => {
    expect(matchByName(ctx.projects, "login redesign")?.id).toBe(P_LOGIN);
    expect(matchByName(ctx.projects, "design system")?.id).toBe(P_DS);
    expect(matchByName(ctx.projects, "Login")?.id).toBe(P_LOGIN);
    expect(matchByName(ctx.projects, "Checkout")).toBeNull();
  });
});

describe("parseDraftResponse: creates", () => {
  it("resolves project names and statuses, defaults status to In progress", () => {
    const r = parseDraftResponse(
      JSON.stringify({
        creates: [
          { title: "Password show/hide toggle", notes: "Eye icon", project: "login redesign", status: "on hold" },
          { title: "Team retro notes" },
        ],
      }),
      ctx,
    );
    expect(r.creates).toHaveLength(2);
    expect(r.creates[0]).toMatchObject({ title: "Password show/hide toggle", notes: "Eye icon", projectId: P_LOGIN, projectName: "Login Redesign", status: "HOLD", flags: {} });
    expect(r.creates[1]).toMatchObject({ projectId: null, projectName: null, status: "IN_PROGRESS", notes: "", flags: {} });
  });

  it("accepts 'description' as notes and explicit 'none' / null projects without flags", () => {
    const r = parseDraftResponse({ creates: [{ title: "A", description: "from description", project: "none" }, { title: "B", project: null }] }, ctx);
    expect(r.creates[0]).toMatchObject({ notes: "from description", projectId: null, flags: {} });
    expect(r.creates[1].flags).toEqual({});
  });

  it("flags unknown projects and statuses instead of guessing", () => {
    const r = parseDraftResponse({ creates: [{ title: "X", project: "Mobile App", status: "review" }] }, ctx);
    expect(r.creates[0].projectId).toBeNull();
    expect(r.creates[0].projectName).toBe("Mobile App");
    expect(r.creates[0].flags.project).toMatch(/not found/i);
    expect(r.creates[0].flags.status).toMatch(/unknown status/i);
    expect(r.creates[0].status).toBe("IN_PROGRESS");
  });

  it("skips entries without a title and warns", () => {
    const r = parseDraftResponse({ creates: [{ title: "  " }, { notes: "no title" }, { title: "ok" }] }, ctx);
    expect(r.creates.map((c) => c.title)).toEqual(["ok"]);
    expect(r.warnings).toHaveLength(2);
  });

  it("coerces numbers to strings and trims long titles", () => {
    const r = parseDraftResponse({ creates: [{ title: 42 }, { title: "x".repeat(300) }] }, ctx);
    expect(r.creates[0].title).toBe("42");
    expect(r.creates[1].title).toHaveLength(200);
  });

  it("rejects replies that don't match the format", () => {
    expect(() => parseDraftResponse({ creates: "nope" }, ctx)).toThrow(DraftParseError);
    expect(() => parseDraftResponse("no json here", ctx)).toThrow(DraftParseError);
  });
});

describe("parseDraftResponse: updates", () => {
  it("builds before/after diffs for status and project changes", () => {
    const r = parseDraftResponse(
      { updates: [{ itemId: I1, changes: { status: "done" } }, { itemId: I3, changes: { project: "Design System v2", status: "hold" } }] },
      ctx,
    );
    expect(r.updates).toHaveLength(2);
    expect(r.updates[0]).toMatchObject({ itemId: I1, itemTitle: "6-box code input", before: { status: "IN_PROGRESS" }, after: { status: "DONE" } });
    expect(r.updates[1]).toMatchObject({ before: { projectId: null, status: "IN_PROGRESS" }, after: { projectId: P_DS, status: "HOLD" } });
  });

  it("can move an item out of its project", () => {
    const r = parseDraftResponse({ updates: [{ itemId: I1, changes: { project: null } }] }, ctx);
    expect(r.updates[0]).toMatchObject({ before: { projectId: P_LOGIN }, after: { projectId: null } });
  });

  it("warns about unknown item ids and no-op changes", () => {
    const r = parseDraftResponse({ updates: [{ itemId: "missing", changes: { status: "done" } }, { itemId: I2, changes: { status: "hold" } }] }, ctx);
    expect(r.updates).toHaveLength(0);
    expect(r.warnings.join(" ")).toMatch(/not found/);
    expect(r.warnings.join(" ")).toMatch(/No change needed/);
  });

  it("flags an unknown status on an update", () => {
    const r = parseDraftResponse({ updates: [{ itemId: I1, changes: { status: "shipped-ish" } }] }, ctx);
    expect(r.updates[0].flags.status).toMatch(/unknown status/i);
  });

  it("warns when nothing at all was proposed", () => {
    expect(parseDraftResponse({ creates: [], updates: [] }, ctx).warnings).toEqual(["The AI didn't propose any changes."]);
  });
});

describe("mockLlmReply (dev mock) round-trips through the parser", () => {
  it("drafts N items for a project", () => {
    const r = parseDraftResponse(mockLlmReply("Add 3 items for the login page redesign", ctx), ctx);
    expect(r.creates).toHaveLength(3);
    expect(r.creates.every((c) => c.projectId === P_LOGIN && c.status === "IN_PROGRESS")).toBe(true);
  });

  it("doesn't confuse 'redesign' with 'Design System'", () => {
    const r = parseDraftResponse(mockLlmReply("Add 2 items for the login page redesign", ctx), ctx);
    expect(r.creates[0].projectName).toBe("Login Redesign");
  });

  it("proposes status changes scoped to a project", () => {
    const r = parseDraftResponse(mockLlmReply("Mark all Login Redesign items as done", ctx), ctx);
    expect(r.creates).toHaveLength(0);
    expect(r.updates.map((u) => u.itemId)).toEqual([I1]);
    expect(r.updates[0].after.status).toBe("DONE");
  });

  it("understands 'on hold' and 'rejected'", () => {
    expect(parseDraftResponse(mockLlmReply("Put everything on hold", ctx), ctx).updates.every((u) => u.after.status === "HOLD")).toBe(true);
    expect(parseDraftResponse(mockLlmReply("Mark Design System v2 items as rejected", ctx), ctx).updates[0].after.status).toBe("REJECT");
  });
});
