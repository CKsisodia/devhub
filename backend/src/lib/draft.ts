/**
 * AI backlog entry: turning the LLM's JSON answer into a validated, editable draft.
 * Pure functions (no DB / network) so they are easy to unit-test.
 */
import { z } from "zod";
import { BACKLOG_STATUSES } from "./schemas.js";

export type Status = (typeof BACKLOG_STATUSES)[number];

export interface DraftContext {
  today: string; // YYYY-MM-DD
  projects: { id: string; name: string }[];
  items: { id: string; title: string; projectId: string | null; status: Status }[];
}

export interface DraftFlags {
  project?: string;
  status?: string;
}

export interface DraftItem {
  title: string;
  notes: string;
  projectId: string | null;
  projectName: string | null;
  status: Status;
  flags: DraftFlags;
}

export interface ItemFields {
  title?: string;
  notes?: string;
  projectId?: string | null;
  status?: Status;
}

export interface DraftUpdate {
  itemId: string;
  itemTitle: string;
  before: ItemFields;
  after: ItemFields;
  flags: DraftFlags;
}

export interface DraftResult {
  creates: DraftItem[];
  updates: DraftUpdate[];
  warnings: string[];
  message?: string;
}

// ---------- Raw LLM schema (lenient) ----------

const looseStr = z.union([z.string(), z.number()]).transform(String);
const optStr = z.union([looseStr, z.null()]).optional();

const rawCreate = z.object({ title: looseStr, notes: optStr, description: optStr, project: optStr, status: optStr });
const rawUpdate = z.object({
  itemId: looseStr,
  changes: z.object({ title: optStr, notes: optStr, project: optStr, status: optStr }).partial(),
});
const rawResponse = z.object({
  creates: z.array(z.unknown()).optional().default([]),
  updates: z.array(z.unknown()).optional().default([]),
  message: optStr,
});

export class DraftParseError extends Error {}

/** Pulls the first JSON object out of an LLM reply (handles ```json fences and chatter around it). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new DraftParseError("The AI reply did not contain JSON.");
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new DraftParseError("The AI reply was not valid JSON.");
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const STATUS_WORDS: Record<string, Status> = {
  inprogress: "IN_PROGRESS",
  progress: "IN_PROGRESS",
  doing: "IN_PROGRESS",
  wip: "IN_PROGRESS",
  active: "IN_PROGRESS",
  open: "IN_PROGRESS",
  todo: "IN_PROGRESS",
  started: "IN_PROGRESS",
  hold: "HOLD",
  onhold: "HOLD",
  paused: "HOLD",
  blocked: "HOLD",
  waiting: "HOLD",
  parked: "HOLD",
  done: "DONE",
  completed: "DONE",
  complete: "DONE",
  finished: "DONE",
  closed: "DONE",
  reject: "REJECT",
  rejected: "REJECT",
  wontdo: "REJECT",
  wontfix: "REJECT",
  cancelled: "REJECT",
  canceled: "REJECT",
  dropped: "REJECT",
};

/** Maps spellings like "In Progress", "on hold", "rejected", "IN_PROGRESS" to a status. */
export function normalizeStatus(v: string | null | undefined): Status | null {
  if (!v) return null;
  return STATUS_WORDS[norm(v).replace(/ /g, "")] ?? null;
}

/** Case-insensitive match: exact name, then unique prefix / first word, then unique substring. */
export function matchByName<T extends { id: string; name: string }>(items: T[], query: string): T | null {
  const q = norm(query);
  if (!q) return null;
  const exact = items.filter((i) => norm(i.name) === q);
  if (exact.length === 1) return exact[0];
  const prefix = items.filter((i) => norm(i.name).startsWith(q) || norm(i.name).split(" ")[0] === q);
  if (prefix.length === 1) return prefix[0];
  const contains = items.filter((i) => norm(i.name).includes(q) || q.includes(norm(i.name)));
  if (contains.length === 1) return contains[0];
  return null;
}

const NO_PROJECT = new Set(["", "none", "null", "no project", "general", "n a"]);

/** undefined = not mentioned; {id:null,name:null} = explicitly no project; unmatched names are flagged. */
function resolveProject(ctx: DraftContext, raw: string | null | undefined, flags: DraftFlags) {
  if (raw === undefined) return undefined;
  if (raw === null || NO_PROJECT.has(norm(raw))) return { id: null, name: null };
  const p = matchByName(ctx.projects, raw);
  if (!p) {
    flags.project = `Not found – pick a project or leave empty ("${raw}")`;
    return { id: null, name: raw };
  }
  return { id: p.id, name: p.name };
}

/** Validate and resolve the LLM's answer against known projects / backlog items. */
export function parseDraftResponse(input: string | unknown, ctx: DraftContext): DraftResult {
  const json = typeof input === "string" ? extractJson(input) : input;
  const top = rawResponse.safeParse(json);
  if (!top.success) throw new DraftParseError("The AI reply did not match the expected backlog format.");

  const warnings: string[] = [];
  const creates: DraftItem[] = [];
  const updates: DraftUpdate[] = [];

  top.data.creates.slice(0, 50).forEach((entry, idx) => {
    const r = rawCreate.safeParse(entry);
    if (!r.success || !r.data.title.trim()) {
      warnings.push(`Skipped draft #${idx + 1}: missing title.`);
      return;
    }
    const c = r.data;
    const flags: DraftFlags = {};
    const project = resolveProject(ctx, c.project, flags);
    const status = normalizeStatus(c.status);
    if (c.status && !status) flags.status = `Unknown status "${c.status}"`;
    creates.push({
      title: c.title.trim().slice(0, 200),
      notes: (c.notes ?? c.description ?? "").trim(),
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
      status: status ?? "IN_PROGRESS",
      flags,
    });
  });

  top.data.updates.slice(0, 100).forEach((entry, idx) => {
    const r = rawUpdate.safeParse(entry);
    if (!r.success) {
      warnings.push(`Skipped update #${idx + 1}: invalid format.`);
      return;
    }
    const item = ctx.items.find((i) => i.id === r.data.itemId);
    if (!item) {
      warnings.push(`Skipped update #${idx + 1}: item "${r.data.itemId}" not found.`);
      return;
    }
    const ch = r.data.changes;
    const flags: DraftFlags = {};
    const before: ItemFields = {};
    const after: ItemFields = {};
    const set = <K extends keyof ItemFields>(key: K, next: ItemFields[K], prev: ItemFields[K]) => {
      if (JSON.stringify(next) === JSON.stringify(prev)) return;
      before[key] = prev;
      after[key] = next;
    };

    if (ch.title) set("title", ch.title.trim().slice(0, 200), item.title);
    if (ch.notes !== undefined && ch.notes !== null) set("notes", ch.notes, undefined);
    if (ch.status) {
      const s = normalizeStatus(ch.status);
      if (s) set("status", s, item.status);
      else flags.status = `Unknown status "${ch.status}"`;
    }
    if (ch.project !== undefined) {
      const p = resolveProject(ctx, ch.project, flags);
      if (p && !flags.project) set("projectId", p.id, item.projectId);
    }

    if (Object.keys(after).length === 0 && Object.keys(flags).length === 0) {
      warnings.push(`No change needed for "${item.title}".`);
      return;
    }
    updates.push({ itemId: item.id, itemTitle: item.title, before, after, flags });
  });

  if (!creates.length && !updates.length && !warnings.length) warnings.push("The AI didn't propose any changes.");
  return { creates, updates, warnings, message: top.data.message ?? undefined };
}

// ---------- Prompt ----------

export function buildMessages(prompt: string, ctx: DraftContext) {
  const projectName = (id: string | null) => ctx.projects.find((p) => p.id === id)?.name ?? null;
  const system = [
    "You turn a frontend team admin's request into backlog changes. The backlog is a simple list of notes-like records.",
    "Reply with ONE JSON object only, no prose:",
    '{"creates":[{"title":string,"notes":string,"project":string|null,"status":"IN_PROGRESS"|"HOLD"|"DONE"|"REJECT"}],',
    ' "updates":[{"itemId":string,"changes":{"status"?:...,"title"?:string,"notes"?:string,"project"?:string|null}}],',
    ' "message":string}',
    "Rules: use project names exactly as listed; project is optional (null when the request doesn't name one). Only reference itemIds from the item list.",
    "Use creates for new items and updates for changes to existing items. Default status IN_PROGRESS. Keep titles short (under 80 chars); put details in notes.",
    "Never invent projects; if a name doesn't match, still write the name you were given so the admin can fix it.",
    `Today is ${ctx.today}.`,
  ].join("\n");
  const context = {
    projects: ctx.projects.map((p) => p.name),
    statuses: BACKLOG_STATUSES,
    items: ctx.items.map((i) => ({ itemId: i.id, title: i.title, project: projectName(i.projectId), status: i.status })),
  };
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: `Context:\n${JSON.stringify(context)}\n\nRequest: ${prompt}` },
  ];
}

// ---------- Deterministic mock (dev only, clearly labelled in the UI) ----------

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1 };

function findProject(p: string, ctx: DraftContext) {
  const exact = ctx.projects.find((pr) => p.includes(pr.name.toLowerCase()));
  if (exact) return exact;
  // Score by whole-word overlap, e.g. "login page redesign" -> "Login Redesign".
  const scored = ctx.projects
    .map((pr) => ({
      pr,
      score: pr.name
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3 && new RegExp(`\\b${w.replace(/[^a-z0-9]/g, "")}\\b`).test(p)).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.pr;
}

/** Produces an LLM-shaped JSON string from simple keyword rules, so the whole flow works without an API key. */
export function mockLlmReply(prompt: string, ctx: DraftContext): string {
  const p = prompt.toLowerCase();
  const project = findProject(p, ctx);

  // "Mark all Checkout Performance items as done", "move ... to hold"
  const moveMatch = p.match(/\b(?:move|mark|set|change|put)\b.*\b(?:to|as|on)\s+(in ?progress|on ?hold|hold|done|rejected|reject)\b/);
  if (moveMatch) {
    const status = normalizeStatus(moveMatch[1]);
    const matches = ctx.items.filter((i) => (!project || i.projectId === project.id) && i.status !== status);
    return JSON.stringify({
      creates: [],
      updates: matches.slice(0, 10).map((i) => ({ itemId: i.id, changes: { status } })),
      message: `Mock AI: proposing ${Math.min(10, matches.length)} status change(s).`,
    });
  }

  const countMatch = p.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s+(?:new\s+)?(?:items?|notes?|tasks?|entries|backlog items?)\b/);
  const count = Math.min(10, Math.max(1, countMatch ? Number(countMatch[1]) || WORDS[countMatch[1]] || 1 : 1));
  const forMatch = prompt.match(/\b(?:for|about) (?:the )?(.+?)(?:,|\.|$| with | in )/i);
  const topic = (forMatch?.[1] ?? project?.name ?? "frontend").trim();
  const ideas = [
    "Build the main layout",
    "Implement form validation",
    "Add loading and error states",
    "Write unit tests",
    "Check accessibility (keyboard + screen reader)",
    "Make it responsive on mobile",
    "Polish copy and empty states",
    "Add analytics events",
    "Review performance (Lighthouse)",
    "Update docs",
  ];
  const status = p.includes("on hold") ? "HOLD" : "IN_PROGRESS";
  return JSON.stringify({
    creates: Array.from({ length: count }, (_, i) => ({
      title: `${ideas[i % ideas.length]} – ${topic}`,
      notes: `Drafted by the mock AI from: "${prompt}"`,
      project: project?.name ?? (forMatch ? topic : null),
      status,
    })),
    updates: [],
    message: `Mock AI: drafted ${count} item(s).`,
  });
}
