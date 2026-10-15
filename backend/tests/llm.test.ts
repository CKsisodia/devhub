import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config.js";
import { buildMessages, buildRepairMessage, parseDraftResponse, type DraftContext } from "../src/lib/draft.js";
import { callChatCompletions, draftWorkItems, isKeylessBaseUrl, llmMode } from "../src/lib/llm.js";
import { HttpError } from "../src/lib/errors.js";

const P = "aaaaaaaa-0000-4000-8000-000000000001";
const I1 = "cccccccc-0000-4000-8000-000000000001";
const base = (type: DraftContext["type"]): DraftContext => ({
  today: "2026-10-15",
  type,
  projects: [{ id: P, name: "Dashboard" }],
  items: [{ id: I1, title: "Existing thing", projectId: P, status: "TODO", targetPeriod: "2026-Q4", goal: "g", timeboxEnd: "2026-10-30", findings: "", outcome: null }],
});

const reply = (content: string, status = 200) =>
  new Response(status === 200 ? JSON.stringify({ choices: [{ message: { content } }] }) : content, { status, headers: { "Content-Type": "application/json" } });

const saved = { ...config.llm };
beforeEach(() => {
  Object.assign(config.llm, { apiKey: undefined, baseUrl: "http://localhost:11434/v1", model: "qwen2.5:7b", timeoutMs: 90_000, contextItems: 60, mock: true });
});
afterEach(() => {
  Object.assign(config.llm, saved);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("provider configuration", () => {
  it("treats local / Ollama URLs as keyless", () => {
    expect(isKeylessBaseUrl("http://localhost:11434/v1")).toBe(true);
    expect(isKeylessBaseUrl("http://127.0.0.1:11434/v1")).toBe(true);
    expect(isKeylessBaseUrl("http://ollama.internal:11434/v1")).toBe(true);
    expect(isKeylessBaseUrl("https://api.groq.com/openai/v1")).toBe(false);
    expect(isKeylessBaseUrl("not a url")).toBe(false);
  });
  it("uses the LLM for Ollama with no key", () => expect(llmMode()).toBe("llm"));
  it("uses the mock only when no LLM is configured", () => {
    config.llm.baseUrl = "https://api.openai.com/v1";
    expect(llmMode()).toBe("mock");
    config.llm.mock = false;
    expect(llmMode()).toBe("disabled");
    config.llm.apiKey = "gsk_x";
    expect(llmMode()).toBe("llm");
  });
});

describe("buildMessages", () => {
  it.each([
    ["TASK", ["Split a request"], []],
    ["ROADMAP", ['"targetPeriod"', "YYYY-Qn"], ['"outcome"']],
    ["RND", ['"goal"', '"timeboxEnd"', '"findings"'], ['"outcome"', '"targetPeriod"']],
    ["POC", ['"outcome"', "NEEDS_MORE_WORK", '"goal"'], ['"targetPeriod"']],
  ] as const)("%s prompt names its fields and an example", (type, has, hasNot) => {
    const [sys, user] = buildMessages("do it", base(type));
    expect(sys.role).toBe("system");
    expect(sys.content).toContain("ONE JSON object");
    expect(sys.content).toContain("Example reply:");
    expect(sys.content).toContain("Today is 2026-10-15");
    for (const h of has) expect(sys.content).toContain(h);
    for (const h of hasNot) expect(sys.content.split("Example reply:")[0]).not.toContain(h);
    expect(user.content).toContain("Request: do it");
    expect(user.content).toContain(I1);
  });
  it("each example reply parses cleanly", () => {
    for (const t of ["TASK", "ROADMAP", "RND", "POC"] as const) {
      const ex = buildMessages("x", base(t))[0].content.split("Example reply: ")[1];
      const r = parseDraftResponse(ex, base(t));
      expect(r.creates).toHaveLength(1);
      expect(r.warnings).toEqual([]);
    }
  });
  it("caps context items", () => {
    const ctx = base("TASK");
    ctx.items = Array.from({ length: 100 }, (_, i) => ({ ...ctx.items[0], id: `id-${i}` }));
    const ctxJson = JSON.parse(buildMessages("x", ctx, 10)[1].content.split("\n\nRequest:")[0].replace("Context:\n", ""));
    expect(ctxJson.items).toHaveLength(10);
  });
  it("includes section extras for existing items", () => {
    expect(buildMessages("x", base("ROADMAP"))[1].content).toContain('"targetPeriod":"2026-Q4"');
    expect(buildMessages("x", base("POC"))[1].content).toContain('"timeboxEnd":"2026-10-30"');
  });
  it("repair message asks for JSON only", () => expect(buildRepairMessage("bad.").content).toMatch(/ONE valid JSON object/));
});

describe("callChatCompletions (fetch mocked)", () => {
  it("posts JSON mode to the base URL without auth header when keyless", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply('{"creates":[]}'));
    await callChatCompletions([{ role: "user", content: "hi" }]);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "qwen2.5:7b", response_format: { type: "json_object" }, stream: false });
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
  it("sends a bearer token when a key is set", async () => {
    config.llm.apiKey = "k";
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply("{}"));
    await callChatCompletions([]);
    expect(((f.mock.calls[0][1] as RequestInit).headers as Record<string, string>).Authorization).toBe("Bearer k");
  });
  it("explains when Ollama is down", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    await expect(callChatCompletions([])).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/Is Ollama running/) });
  });
  it("explains a missing model", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"error":{"message":"model \\"qwen2.5:7b\\" not found"}}', { status: 404 }));
    await expect(callChatCompletions([])).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/ollama pull qwen2.5:7b/) });
  });
  it("times out", async () => {
    config.llm.timeoutMs = 20;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_u, init) => new Promise((_r, rej) => (init as RequestInit).signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")))),
    );
    await expect(callChatCompletions([])).rejects.toMatchObject({ status: 504 });
  });
  it("rejects an empty answer", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "" } }] })));
    await expect(callChatCompletions([])).rejects.toBeInstanceOf(HttpError);
  });
});

describe("draftWorkItems (fetch mocked)", () => {
  const good = JSON.stringify({ creates: [{ title: "Prototype SSR", project: "dashboard", status: "wip", goal: "Faster", timeboxEnd: "2026-11-01", outcome: "go" }], updates: [], message: "ok" });
  it("returns validated drafts with source and model", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(good));
    const r = await draftWorkItems("x", base("POC"));
    expect(r).toMatchObject({ source: "llm", model: "qwen2.5:7b" });
    expect(r.creates[0]).toMatchObject({ projectId: P, status: "IN_PROGRESS", outcome: "ADOPT", timeboxEnd: "2026-11-01" });
  });
  it("retries once on invalid JSON, sending the bad answer back", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(reply("Sure, here you go: {creates: [")).mockResolvedValueOnce(reply(good));
    const r = await draftWorkItems("x", base("POC"));
    expect(f).toHaveBeenCalledTimes(2);
    const msgs = JSON.parse(String((f.mock.calls[1][1] as RequestInit).body)).messages;
    expect(msgs.at(-2)).toMatchObject({ role: "assistant" });
    expect(msgs.at(-1).content).toMatch(/could not be used/);
    expect(r.creates).toHaveLength(1);
  });
  it("retries on wrong shape too, then gives up with a clear error", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply('{"creates":"nope"}'));
    await expect(draftWorkItems("x", base("TASK"))).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/expected format twice/) });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("does not retry transport errors", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    await expect(draftWorkItems("x", base("TASK"))).rejects.toMatchObject({ status: 503 });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("uses the mock without calling fetch when no LLM is configured", async () => {
    config.llm.baseUrl = "https://api.openai.com/v1";
    const f = vi.spyOn(globalThis, "fetch");
    const r = await draftWorkItems("add two tasks", base("TASK"));
    expect(r.source).toBe("mock");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("date anchors and project placeholders", () => {
  it("roadmap anchors quarters and months", async () => {
    const { dateHints } = await import("../src/lib/draft.js");
    const h = dateHints("2026-10-15", "ROADMAP");
    expect(h).toContain("this quarter = 2026-Q4");
    expect(h).toContain("next quarter = 2027-Q1");
    expect(h).toContain('"March 2027" = "2027-03"');
    expect(dateHints("2026-12-20", "ROADMAP")).toContain("next month = 2027-01");
  });
  it("R&D / POC anchors week offsets and Friday", async () => {
    const { dateHints } = await import("../src/lib/draft.js");
    const h = dateHints("2026-10-15", "POC"); // a Thursday
    expect(h).toContain("2 weeks = 2026-10-29");
    expect(h).toContain("3 weeks = 2026-11-05");
    expect(h).toContain("this/next Friday = 2026-10-16");
    expect(dateHints("2026-10-15", "TASK")).toBe("");
    expect(buildMessages("x", base("RND"))[0].content).toContain("2 weeks = 2026-10-29");
  });
  it('treats "Unknown" / "TBD" as no project', () => {
    for (const project of ["Unknown", "TBD", "unspecified"]) {
      const r = parseDraftResponse(JSON.stringify({ creates: [{ title: "x", project }] }), base("TASK"));
      expect(r.creates[0]).toMatchObject({ projectId: null, projectName: null });
      expect(r.creates[0].flags.project).toBeUndefined();
    }
  });
});
