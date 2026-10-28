/** Task attachments, links and AI rephrase: validation and parsing (no database). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config.js";
import { HttpError } from "../src/lib/errors.js";
import { rephraseNotes } from "../src/lib/llm.js";
import { buildRephraseMessages, mockRephrase, parseRephraseResponse } from "../src/lib/rephrase.js";
import { assertExtrasAllowed, workItemCreateSchema, workItemLinkSchema, workItemUpdateSchema } from "../src/lib/schemas.js";
import { resolveAttachmentType } from "../src/lib/storage.js";

describe("links", () => {
  it("accepts http and https URLs with an optional label", () => {
    expect(workItemLinkSchema.parse({ url: " https://example.com/a?b=1 " })).toEqual({ url: "https://example.com/a?b=1", label: "" });
    expect(workItemLinkSchema.parse({ url: "http://localhost:3000", label: " Local " })).toEqual({ url: "http://localhost:3000", label: "Local" });
  });
  it.each(["javascript:alert(1)", "ftp://example.com", "mailto:a@b.c", "example.com", "data:text/html,hi", "", "https://"])("rejects %s", (url) => {
    expect(workItemLinkSchema.safeParse({ url }).success).toBe(false);
  });
  it("is part of the create and update schemas, max 25", () => {
    expect(workItemCreateSchema.parse({ title: "t", links: [{ url: "https://a.dev" }] }).links).toHaveLength(1);
    expect(workItemUpdateSchema.safeParse({ links: Array.from({ length: 26 }, () => ({ url: "https://a.dev" })) }).success).toBe(false);
  });
  it("is only allowed on Tasks", () => {
    expect(() => assertExtrasAllowed("TASK", { links: [] })).not.toThrow();
    expect(() => assertExtrasAllowed("ROADMAP", { links: [] })).toThrow(/links/);
  });
});

describe("attachment types", () => {
  it("uses the MIME type when allowed", () => expect(resolveAttachmentType("application/pdf", "x.bin")).toEqual({ mimeType: "application/pdf", ext: ".pdf" }));
  it("falls back to an allowed extension", () => {
    expect(resolveAttachmentType("application/octet-stream", "Notes.MD")).toEqual({ mimeType: "text/markdown", ext: ".md" });
    expect(resolveAttachmentType("", "photo.jpeg")).toEqual({ mimeType: "image/jpeg", ext: ".jpg" });
  });
  it("rejects anything else", () => {
    expect(resolveAttachmentType("text/html", "page.html")).toBeNull();
    expect(resolveAttachmentType("application/octet-stream", "run.exe")).toBeNull();
    expect(resolveAttachmentType("application/x-sh", "x.pdf.sh")).toBeNull();
  });
});

describe("rephrase", () => {
  const saved = { ...config.llm };
  beforeEach(() => Object.assign(config.llm, { apiKey: "k", baseUrl: "https://api.example.com/v1", model: "m", timeoutMs: 5000, mock: false }));
  afterEach(() => {
    Object.assign(config.llm, saved);
    vi.restoreAllMocks();
  });
  const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });

  it("builds a prompt that keeps facts and asks for JSON", () => {
    const m = buildRephraseMessages("fix login bug asap", "Login");
    expect(m[0].content).toMatch(/Do not invent/);
    expect(m[0].content).toMatch(/JSON object only/);
    expect(m[1].content).toContain("fix login bug asap");
    expect(m[1].content).toContain("Login");
  });
  it("parses and normalises the answer", () => {
    expect(parseRephraseResponse('```json\n{"text": "Summary.\\r\\n\\n\\n\\n- One  \\n- Two"}\n```')).toBe("Summary.\n\n- One\n- Two");
    expect(() => parseRephraseResponse("no json")).toThrow();
    expect(() => parseRephraseResponse('{"text": ""}')).toThrow();
  });
  it("mock tidies text", () => expect(mockRephrase("  fix the  bug\n- check safari")).toBe("Fix the bug.\n- Check safari."));
  it("calls the LLM and retries once on bad output", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(reply("oops")).mockResolvedValueOnce(reply('{"text":"Clean notes."}'));
    const r = await rephraseNotes("messy notes");
    expect(r).toMatchObject({ text: "Clean notes.", source: "llm", model: "m" });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("rewords provider errors for rephrase", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("boom", { status: 500 }));
    const e = await rephraseNotes("x").catch((err: unknown) => err);
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).message).toMatch(/^Couldn't rephrase the notes/);
  });
  it("uses the mock in development when no LLM is configured", async () => {
    Object.assign(config.llm, { apiKey: undefined, mock: true });
    expect((await rephraseNotes("hello")).source).toBe("mock");
  });
});
