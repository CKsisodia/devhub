import { describe, expect, it } from "vitest";
import { DraftParseError, extractJson, matchByName, mockLlmReply, normalizeDate, normalizeOutcome, normalizePeriod, normalizeStatus, parseDraftResponse, type DraftContext } from "../src/lib/draft.js";

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
    ["To do", "TODO"],
    ["todo", "TODO"],
    ["backlog", "TODO"],
    ["not started", "TODO"],
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
  it("resolves project names and statuses, defaults status to To do", () => {
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
    expect(r.creates[1]).toMatchObject({ projectId: null, projectName: null, status: "TODO", notes: "", flags: {} });
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
    expect(r.creates[0].status).toBe("TODO");
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
    expect(r.creates.every((c) => c.projectId === P_LOGIN && c.status === "TODO")).toBe(true);
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

describe("type-specific fields", () => {
  const roadmap: DraftContext = { ...ctx, type: "ROADMAP", items: [{ id: I1, title: "Ship DS v2", projectId: P_DS, status: "TODO", targetPeriod: "2026-Q4" }] };
  const rnd: DraftContext = { ...ctx, type: "RND", items: [] };
  const poc: DraftContext = { ...ctx, type: "POC", items: [{ id: I2, title: "View transitions", projectId: null, status: "IN_PROGRESS", goal: "", findings: "", timeboxEnd: null, outcome: null }] };

  it.each([
    ["2026-Q4", "2026-Q4"],
    ["Q1 2027", "2027-Q1"],
    ["2027 q2", "2027-Q2"],
    ["Q3", "2026-Q3"],
    ["2026-11", "2026-11"],
    ["Nov 2026", "2026-11"],
    ["November 2026", "2026-11"],
    ["3/2027", "2027-03"],
  ])("normalizePeriod(%s) -> %s", (input, expected) => expect(normalizePeriod(input, ctx.today)).toBe(expected));
  it("normalizePeriod rejects nonsense", () => {
    expect(normalizePeriod("someday", ctx.today)).toBeNull();
    expect(normalizePeriod("2026-13", ctx.today)).toBeNull();
    expect(normalizePeriod("Q5", ctx.today)).toBeNull();
  });
  it("normalizeOutcome and normalizeDate", () => {
    expect(normalizeOutcome("Adopt")).toBe("ADOPT");
    expect(normalizeOutcome("dropped")).toBe("DROP");
    expect(normalizeOutcome("needs more work")).toBe("NEEDS_MORE_WORK");
    expect(normalizeOutcome("maybe")).toBeNull();
    expect(normalizeDate("2026-11-02")).toBe("2026-11-02");
    expect(normalizeDate("next Friday")).toBeNull();
  });

  it("roadmap creates carry a target period (flagged when unreadable)", () => {
    const r = parseDraftResponse({ creates: [{ title: "A", targetPeriod: "Q1 2027" }, { title: "B", target: "someday" }, { title: "C" }] }, roadmap);
    expect(r.type).toBe("ROADMAP");
    expect(r.creates[0].targetPeriod).toBe("2027-Q1");
    expect(r.creates[1].targetPeriod).toBeNull();
    expect(r.creates[1].flags.targetPeriod).toMatch(/couldn't read/i);
    expect(r.creates[2]).toMatchObject({ targetPeriod: null, flags: {} });
    expect(r.creates[0]).not.toHaveProperty("goal");
  });

  it("R&D creates carry goal / time box / findings but never an outcome", () => {
    const r = parseDraftResponse({ creates: [{ title: "Signals", goal: "Is it faster?", timeboxEnd: "2026-10-30", outcome: "adopt", targetPeriod: "Q4" }] }, rnd);
    expect(r.creates[0]).toMatchObject({ goal: "Is it faster?", timeboxEnd: "2026-10-30", findings: "", flags: {} });
    expect(r.creates[0]).not.toHaveProperty("outcome");
    expect(r.creates[0]).not.toHaveProperty("targetPeriod");
  });

  it("POC creates and updates handle outcome", () => {
    const c = parseDraftResponse({ creates: [{ title: "X", outcome: "maybe", timeboxEnd: "soon" }] }, poc);
    expect(c.creates[0]).toMatchObject({ outcome: null, timeboxEnd: null });
    expect(c.creates[0].flags.outcome).toMatch(/unknown outcome/i);
    expect(c.creates[0].flags.timeboxEnd).toMatch(/couldn't read/i);
    const u = parseDraftResponse({ updates: [{ itemId: I2, changes: { outcome: "adopt", findings: "40% less JS", status: "done" } }] }, poc);
    expect(u.updates[0]).toMatchObject({ before: { outcome: null, findings: "", status: "IN_PROGRESS" }, after: { outcome: "ADOPT", findings: "40% less JS", status: "DONE" } });
  });

  it("tasks ignore type-specific fields", () => {
    const r = parseDraftResponse({ creates: [{ title: "T", targetPeriod: "Q4", goal: "g", outcome: "adopt" }] }, ctx);
    expect(Object.keys(r.creates[0]).sort()).toEqual(["flags", "notes", "projectId", "projectName", "status", "title"]);
  });

  it("the mock drafts items of the section's type", () => {
    const rm = parseDraftResponse(mockLlmReply("Add 2 roadmap items for Design System v2 in Q1 2027", roadmap), roadmap);
    expect(rm.creates).toHaveLength(2);
    expect(rm.creates.every((c) => c.targetPeriod === "2027-Q1" && c.projectId === P_DS && c.status === "TODO")).toBe(true);
    const rd = parseDraftResponse(mockLlmReply("Add an experiment about signals, 3 weeks", rnd), rnd);
    expect(rd.creates[0]).toMatchObject({ timeboxEnd: "2026-10-29", findings: "" });
    expect(rd.creates[0].goal).toMatch(/signals/);
    const pc = parseDraftResponse(mockLlmReply("Add 1 POC for view transitions", poc), poc);
    expect(pc.creates[0]).toMatchObject({ outcome: null, flags: {} });
  });

  it("the mock can move items back to To do", () => {
    const r = parseDraftResponse(mockLlmReply("Move everything back to to do", poc), poc);
    expect(r.updates[0].after.status).toBe("TODO");
  });
});
