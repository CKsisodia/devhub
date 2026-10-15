/**
 * AI entry for the work sections (Tasks, Roadmap, R&D, POC): turning the LLM's JSON answer into a
 * validated, editable draft. Pure functions (no DB / network) so they are easy to unit-test.
 */
import { z } from "zod";
import { OUTCOME_LABEL, PERIOD_RE, POC_OUTCOMES, WORK_STATUSES, WORK_TYPE_META, type ExtraField, type PocOutcome, type WorkStatus, type WorkType } from "./workTypes.js";

export type Status = WorkStatus;

/** Type-specific fields (only those of the section are ever filled in). */
export interface ExtraFields {
  targetPeriod?: string | null;
  goal?: string;
  timeboxEnd?: string | null;
  findings?: string;
  outcome?: PocOutcome | null;
}

export interface DraftContext {
  today: string; // YYYY-MM-DD
  /** Section the drafts are for. Defaults to TASK. */
  type?: WorkType;
  projects: { id: string; name: string }[];
  /** Existing items of this section (for updates). */
  items: ({ id: string; title: string; projectId: string | null; status: Status } & ExtraFields)[];
}

export interface DraftFlags {
  project?: string;
  status?: string;
  targetPeriod?: string;
  timeboxEnd?: string;
  outcome?: string;
}

export interface DraftItem extends ExtraFields {
  title: string;
  notes: string;
  projectId: string | null;
  projectName: string | null;
  status: Status;
  flags: DraftFlags;
}

export interface ItemFields extends ExtraFields {
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
  type: WorkType;
  creates: DraftItem[];
  updates: DraftUpdate[];
  warnings: string[];
  message?: string;
}

// ---------- Raw LLM schema (lenient) ----------

const looseStr = z.union([z.string(), z.number()]).transform(String);
const optStr = z.union([looseStr, z.null()]).optional();

const rawFields = {
  title: optStr,
  notes: optStr,
  description: optStr,
  project: optStr,
  status: optStr,
  targetPeriod: optStr,
  target: optStr,
  goal: optStr,
  timeboxEnd: optStr,
  timebox: optStr,
  findings: optStr,
  outcome: optStr,
};
const rawCreate = z.object({ ...rawFields, title: looseStr });
const rawUpdate = z.object({ itemId: looseStr, changes: z.object(rawFields).partial() });
const rawResponse = z.object({
  creates: z.array(z.unknown()).optional().default([]),
  updates: z.array(z.unknown()).optional().default([]),
  message: optStr,
});
type RawFields = z.infer<typeof rawUpdate>["changes"];

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
const squash = (s: string) => norm(s).replace(/ /g, "");

const STATUS_WORDS: Record<string, Status> = {
  todo: "TODO",
  backlog: "TODO",
  planned: "TODO",
  notstarted: "TODO",
  new: "TODO",
  next: "TODO",
  queued: "TODO",
  open: "TODO",
  inprogress: "IN_PROGRESS",
  progress: "IN_PROGRESS",
  doing: "IN_PROGRESS",
  wip: "IN_PROGRESS",
  active: "IN_PROGRESS",
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
  shipped: "DONE",
  reject: "REJECT",
  rejected: "REJECT",
  wontdo: "REJECT",
  wontfix: "REJECT",
  cancelled: "REJECT",
  canceled: "REJECT",
  dropped: "REJECT",
};

/** Maps spellings like "To do", "In Progress", "on hold", "rejected", "IN_PROGRESS" to a status. */
export function normalizeStatus(v: string | null | undefined): Status | null {
  if (!v) return null;
  return STATUS_WORDS[squash(v)] ?? null;
}

const OUTCOME_WORDS: Record<string, PocOutcome> = {
  adopt: "ADOPT",
  adopted: "ADOPT",
  go: "ADOPT",
  yes: "ADOPT",
  drop: "DROP",
  dropped: "DROP",
  nogo: "DROP",
  no: "DROP",
  needsmorework: "NEEDS_MORE_WORK",
  moreworkneeded: "NEEDS_MORE_WORK",
  morework: "NEEDS_MORE_WORK",
  inconclusive: "NEEDS_MORE_WORK",
  unclear: "NEEDS_MORE_WORK",
};

/** POC outcome: "Adopt" / "Drop" / "Needs more work" (and a few synonyms). */
export function normalizeOutcome(v: string | null | undefined): PocOutcome | null {
  if (!v) return null;
  return OUTCOME_WORDS[squash(v)] ?? null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Roadmap target period -> "YYYY-MM" or "YYYY-Qn". Accepts "2026-Q4", "Q4 2026", "Q4" (this year),
 * "2026-11", "Nov 2026", "November 2026", "11/2026". Returns null when it can't tell.
 */
export function normalizePeriod(v: string | null | undefined, today: string): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (PERIOD_RE.test(v.trim().toUpperCase())) return v.trim().toUpperCase();
  const year = Number(today.slice(0, 4));
  const q = s.match(/^(?:(\d{4})\s*[- ]?\s*)?q([1-4])(?:\s*[- ]?\s*(\d{4}))?$/);
  if (q) return `${q[1] ?? q[3] ?? year}-Q${q[2]}`;
  const num = s.match(/^(\d{1,2})\s*\/\s*(\d{4})$/);
  if (num && Number(num[1]) >= 1 && Number(num[1]) <= 12) return `${num[2]}-${num[1].padStart(2, "0")}`;
  const named = s.match(/^([a-z]+)\.?\s*(\d{4})?$/);
  if (named) {
    const m = MONTHS.indexOf(named[1].slice(0, 3));
    if (m >= 0 && (named[1].length === 3 || named[1].startsWith(MONTHS[m]))) return `${named[2] ?? year}-${String(m + 1).padStart(2, "0")}`;
  }
  return null;
}

/** YYYY-MM-DD only (the LLM is told today's date and asked for ISO dates). */
export function normalizeDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
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

const NO_PROJECT = new Set(["", "none", "null", "no project", "general", "n a", "na", "unknown", "unspecified", "not specified", "tbd", "undefined", "nil"]);

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

/**
 * Reads the type-specific fields the section uses (others are ignored). Only fields present in `raw` are
 * returned; invalid values are flagged and left out.
 */
function parseExtras(type: WorkType, raw: RawFields, ctx: DraftContext, flags: DraftFlags): ExtraFields {
  const allowed = new Set<ExtraField>(WORK_TYPE_META[type].extras);
  const out: ExtraFields = {};
  const period = raw.targetPeriod !== undefined ? raw.targetPeriod : raw.target;
  if (allowed.has("targetPeriod") && period !== undefined) {
    const p = period === null ? null : normalizePeriod(period, ctx.today);
    if (period !== null && !p) flags.targetPeriod = `Couldn't read "${period}" – pick a month or quarter`;
    else out.targetPeriod = p;
  }
  if (allowed.has("goal") && raw.goal !== undefined) out.goal = (raw.goal ?? "").trim();
  if (allowed.has("findings") && raw.findings !== undefined) out.findings = (raw.findings ?? "").trim();
  const timebox = raw.timeboxEnd !== undefined ? raw.timeboxEnd : raw.timebox;
  if (allowed.has("timeboxEnd") && timebox !== undefined) {
    const d = timebox === null ? null : normalizeDate(timebox);
    if (timebox !== null && !d) flags.timeboxEnd = `Couldn't read date "${timebox}"`;
    else out.timeboxEnd = d;
  }
  if (allowed.has("outcome") && raw.outcome !== undefined) {
    const o = raw.outcome === null ? null : normalizeOutcome(raw.outcome);
    if (raw.outcome !== null && !o) flags.outcome = `Unknown outcome "${raw.outcome}" (use ${POC_OUTCOMES.map((x) => OUTCOME_LABEL[x]).join(" / ")})`;
    else out.outcome = o;
  }
  return out;
}

/** Empty values for the section's type-specific fields (so every create draft has them all). */
function emptyExtras(type: WorkType): ExtraFields {
  const e: ExtraFields = {};
  for (const f of WORK_TYPE_META[type].extras) {
    if (f === "goal" || f === "findings") e[f] = "";
    else e[f] = null;
  }
  return e;
}

/** Validate and resolve the LLM's answer against known projects / items of the section. */
export function parseDraftResponse(input: string | unknown, ctx: DraftContext): DraftResult {
  const type = ctx.type ?? "TASK";
  const json = typeof input === "string" ? extractJson(input) : input;
  const top = rawResponse.safeParse(json);
  if (!top.success) throw new DraftParseError("The AI reply did not match the expected format.");

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
      status: status ?? "TODO",
      ...emptyExtras(type),
      ...parseExtras(type, c, ctx, flags),
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
    const extras = parseExtras(type, ch, ctx, flags);
    for (const k of Object.keys(extras) as (keyof ExtraFields)[]) set(k, extras[k], item[k] ?? (k === "goal" || k === "findings" ? "" : null));

    if (Object.keys(after).length === 0 && Object.keys(flags).length === 0) {
      warnings.push(`No change needed for "${item.title}".`);
      return;
    }
    updates.push({ itemId: item.id, itemTitle: item.title, before, after, flags });
  });

  if (!creates.length && !updates.length && !warnings.length) warnings.push("The AI didn't propose any changes.");
  return { type, creates, updates, warnings, message: top.data.message ?? undefined };
}

// ---------- Prompt ----------

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const SECTION_HELP: Record<WorkType, { what: string; fields: string; rules: string[]; example: string }> = {
  TASK: {
    what: "Tasks: a simple list of notes-like work items.",
    fields: "",
    rules: ["Split a request that lists several things into one create per thing."],
    example:
      '{"creates":[{"title":"Add loading states to the dashboard","notes":"Skeletons for cards and tables","project":"Dashboard","status":"TODO"}],"updates":[],"message":"Drafted 1 task."}',
  },
  ROADMAP: {
    what: "Roadmap: planned frontend initiatives, each with a target period.",
    fields: ',"targetPeriod":"YYYY-MM"|"YYYY-Qn"|null',
    rules: [
      'targetPeriod is a month "YYYY-MM" or a quarter "YYYY-Qn" (e.g. "2026-Q4"). Turn "next quarter", "in March", "Q1" into that form using today\'s date; null if no timing is given.',
    ],
    example:
      '{"creates":[{"title":"Migrate to the new design system","notes":"","project":null,"status":"TODO","targetPeriod":"2026-Q4"}],"updates":[],"message":"Drafted 1 roadmap item."}',
  },
  RND: {
    what: "R&D: time-boxed research items.",
    fields: ',"goal":string,"timeboxEnd":"YYYY-MM-DD"|null,"findings":string',
    rules: [
      "goal is the question the research answers (one sentence). timeboxEnd is the deadline as YYYY-MM-DD; turn \"two weeks\" or \"by Friday\" into a date from today; null if none.",
      "findings stays an empty string unless the request states results.",
    ],
    example:
      '{"creates":[{"title":"Research state management options","notes":"","project":null,"status":"TODO","goal":"Pick between Zustand and Redux Toolkit","timeboxEnd":"2026-10-27","findings":""}],"updates":[],"message":"Drafted 1 R&D item."}',
  },
  POC: {
    what: "POC: time-boxed proofs of concept.",
    fields: ',"goal":string,"timeboxEnd":"YYYY-MM-DD"|null,"findings":string,"outcome":"ADOPT"|"DROP"|"NEEDS_MORE_WORK"|null',
    rules: [
      "goal is what the prototype must prove. timeboxEnd is YYYY-MM-DD (convert relative dates from today) or null.",
      'outcome is null until the request says the POC is decided: "adopt"/"go" -> ADOPT, "drop"/"no-go" -> DROP, "needs more work" -> NEEDS_MORE_WORK. findings empty unless results are stated.',
    ],
    example:
      '{"creates":[{"title":"Prototype server components for the dashboard","notes":"","project":"Dashboard","status":"IN_PROGRESS","goal":"Check load time improves by 30%","timeboxEnd":"2026-11-01","findings":"","outcome":null}],"updates":[],"message":"Drafted 1 POC."}',
  },
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const plusDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Precomputed date anchors so small models don't have to do calendar arithmetic. */
export function dateHints(today: string, type: WorkType): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const q = Math.floor((m - 1) / 3) + 1;
  const nq = q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`;
  const nm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const friday = plusDays(today, ((5 - dow + 7) % 7) || 7);
  if (type === "ROADMAP") {
    return [
      `Date anchors: this month = ${today.slice(0, 7)}, next month = ${nm}, this quarter = ${y}-Q${q}, next quarter = ${nq}, next year = ${y + 1}.`,
      `A named month becomes "YYYY-MM" (e.g. "March ${y + 1}" = "${y + 1}-03"; a month name without a year means its next occurrence). Use "YYYY-Qn" only when the request says a quarter.`,
    ].join("\n");
  }
  if (type === "RND" || type === "POC") {
    return `Date anchors for timeboxEnd: 1 week = ${plusDays(today, 7)}, 2 weeks = ${plusDays(today, 14)}, 3 weeks = ${plusDays(today, 21)}, 4 weeks = ${plusDays(today, 28)}, 1 month = ${plusDays(today, 30)}, 6 weeks = ${plusDays(today, 42)}, 2 months = ${plusDays(today, 61)}, this/next Friday = ${friday}. Use these exact dates; never use today's date for a timebox.`;
  }
  return "";
}

export function buildMessages(prompt: string, ctx: DraftContext, maxItems = 60): ChatMessage[] {
  const type = ctx.type ?? "TASK";
  const help = SECTION_HELP[type];
  const projectName = (id: string | null) => ctx.projects.find((p) => p.id === id)?.name ?? null;
  const statuses = WORK_STATUSES.map((s) => `"${s}"`).join("|");
  const system = [
    `You turn a frontend team admin's request into changes to the "${WORK_TYPE_META[type].label}" section. ${help.what}`,
    "Reply with ONE JSON object only (no prose, no markdown), exactly this shape:",
    `{"creates":[{"title":string,"notes":string,"project":string|null,"status":${statuses}${help.fields}}],`,
    ` "updates":[{"itemId":string,"changes":{ only the fields that change, same names as in creates }}],`,
    ' "message":string}',
    "Rules:",
    "- creates = new items; updates = changes to items in the context list (use their exact itemId). Use [] when there are none.",
    "- status must be one of the listed values; default TODO. \"started/working on\" = IN_PROGRESS, \"finished\" = DONE, \"paused/blocked\" = HOLD, \"cancelled/won't do\" = REJECT.",
    "- project: copy a name from the projects list when the request names one; otherwise null (never \"Unknown\"). If it names an unknown project, still write that name.",
    "- Keep titles short (under 80 chars) and specific; put details in notes. Don't invent details the admin didn't give; leave such fields empty or null.",
    ...help.rules.map((r) => `- ${r}`),
    "- message: one short sentence summarising what you drafted.",
    `Today is ${ctx.today} (${MONTH_NAMES[Number(ctx.today.slice(5, 7)) - 1]} ${ctx.today.slice(0, 4)}).`,
    ...(dateHints(ctx.today, type) ? [dateHints(ctx.today, type)] : []),
    `Example reply: ${help.example}`,
  ].join("\n");
  const extras = (i: DraftContext["items"][number]) => {
    if (type === "ROADMAP") return { targetPeriod: i.targetPeriod ?? null };
    if (type === "RND") return { goal: i.goal ?? "", timeboxEnd: i.timeboxEnd ?? null };
    if (type === "POC") return { goal: i.goal ?? "", timeboxEnd: i.timeboxEnd ?? null, outcome: i.outcome ?? null };
    return {};
  };
  const context = {
    section: WORK_TYPE_META[type].label,
    projects: ctx.projects.map((p) => p.name),
    statuses: WORK_STATUSES,
    items: ctx.items.slice(0, maxItems).map((i) => ({ itemId: i.id, title: i.title, project: projectName(i.projectId), status: i.status, ...extras(i) })),
  };
  return [
    { role: "system", content: system },
    { role: "user", content: `Context:\n${JSON.stringify(context)}\n\nRequest: ${prompt}` },
  ];
}

/** Follow-up message for the single retry after an invalid answer. */
export function buildRepairMessage(problem: string): ChatMessage {
  return {
    role: "user",
    content: `Your previous reply could not be used: ${problem} Reply again with ONE valid JSON object only, with keys "creates", "updates" and "message", exactly as specified. No prose.`,
  };
}

// ---------- Deterministic mock (dev only, clearly labelled in the UI) ----------

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1 };

const IDEAS: Record<WorkType, string[]> = {
  TASK: [
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
  ],
  ROADMAP: ["Ship", "Roll out", "Migrate to", "Launch", "Deprecate the old version of", "Measure adoption of"],
  RND: ["Research", "Compare options for", "Benchmark", "Survey the team about", "Read up on"],
  POC: ["Prototype", "Spike", "Build a throwaway demo of", "Try out", "Test drive"],
};

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

const addDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
function nextQuarter(today: string) {
  const y = Number(today.slice(0, 4));
  const q = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1;
  return q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`;
}

/** Produces an LLM-shaped JSON string from simple keyword rules, so the whole flow works without an API key. */
export function mockLlmReply(prompt: string, ctx: DraftContext): string {
  const type = ctx.type ?? "TASK";
  const p = prompt.toLowerCase();
  const project = findProject(p, ctx);

  // "Mark all Checkout Performance items as done", "move ... to hold"
  const moveMatch = p.match(/\b(?:move|mark|set|change|put)\b.*\b(?:to|as|on|back to)\s+(to ?do|in ?progress|on ?hold|hold|done|rejected|reject)\b/);
  if (moveMatch) {
    const status = normalizeStatus(moveMatch[1]);
    const matches = ctx.items.filter((i) => (!project || i.projectId === project.id) && i.status !== status);
    return JSON.stringify({
      creates: [],
      updates: matches.slice(0, 10).map((i) => ({ itemId: i.id, changes: { status } })),
      message: `Mock AI: proposing ${Math.min(10, matches.length)} status change(s).`,
    });
  }

  const countMatch = p.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s+(?:new\s+)?(?:items?|notes?|tasks?|entries|ideas?|milestones?|initiatives?|experiments?|spikes?|pocs?|research items?|r&d items?|roadmap items?|backlog items?)\b/);
  const count = Math.min(10, Math.max(1, countMatch ? Number(countMatch[1]) || WORDS[countMatch[1]] || 1 : 1));
  const forMatch = prompt.match(/\b(?:for|about|on) (?:the )?(.+?)(?:,|\.|$| with | in | by | due | until )/i);
  const topic = (forMatch?.[1] ?? project?.name ?? "frontend").trim();
  const ideas = IDEAS[type];
  const status = p.includes("on hold") ? "HOLD" : p.includes("in progress") ? "IN_PROGRESS" : "TODO";
  const period = prompt.match(/\bq[1-4](?:\s+\d{4})?\b|\b\d{4}-q[1-4]\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/i)?.[0];
  const weeks = Number(p.match(/\b(\d+)\s*weeks?\b/)?.[1] ?? 2);

  const extrasFor = (i: number): Record<string, unknown> => {
    if (type === "ROADMAP") return { targetPeriod: period ?? nextQuarter(ctx.today) };
    if (type === "RND" || type === "POC")
      return {
        goal: `Find out whether ${topic} is worth it for us (${i + 1}/${count}).`,
        timeboxEnd: addDays(ctx.today, weeks * 7),
        findings: "",
        ...(type === "POC" ? { outcome: null } : {}),
      };
    return {};
  };

  return JSON.stringify({
    creates: Array.from({ length: count }, (_, i) => ({
      title: type === "TASK" ? `${ideas[i % ideas.length]} – ${topic}` : `${ideas[i % ideas.length]} ${topic}${count > 1 ? ` (${i + 1})` : ""}`,
      notes: `Drafted by the mock AI from: "${prompt}"`,
      // Tasks: an unknown "for X" is passed through as a project name (so the preview flags it); other
      // sections are often about a topic rather than a project.
      project: project?.name ?? (type === "TASK" && forMatch ? topic : null),
      status,
      ...extrasFor(i),
    })),
    updates: [],
    message: `Mock AI: drafted ${count} ${WORK_TYPE_META[type].label} item(s).`,
  });
}
