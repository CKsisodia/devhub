/**
 * Prompt-based task entry: turning the LLM's JSON answer into a validated, editable draft.
 * Pure functions (no DB / network) so they are easy to unit-test.
 */
import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES } from "./schemas.js";

export type Status = (typeof TASK_STATUSES)[number];
export type Priority = (typeof TASK_PRIORITIES)[number];

export interface DraftContext {
  today: string; // YYYY-MM-DD
  projects: { id: string; name: string }[];
  users: { id: string; name: string }[];
  tasks: {
    id: string;
    title: string;
    projectId: string;
    assigneeId: string | null;
    status: Status;
    priority: Priority;
    dueDate: string | null;
    tags: string[];
  }[];
}

export interface DraftFlags {
  project?: string;
  assignee?: string;
  dueDate?: string;
  status?: string;
  priority?: string;
}

export interface DraftTask {
  title: string;
  description: string;
  projectId: string | null;
  projectName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  priority: Priority;
  status: Status;
  dueDate: string | null;
  tags: string[];
  flags: DraftFlags;
}

export interface TaskFields {
  title?: string;
  description?: string;
  projectId?: string;
  assigneeId?: string | null;
  priority?: Priority;
  status?: Status;
  dueDate?: string | null;
  tags?: string[];
}

export interface DraftUpdate {
  taskId: string;
  taskTitle: string;
  before: TaskFields;
  after: TaskFields;
  flags: DraftFlags;
}

export interface DraftResult {
  creates: DraftTask[];
  updates: DraftUpdate[];
  warnings: string[];
  message?: string;
}

// ---------- Raw LLM schema (lenient) ----------

const looseStr = z.union([z.string(), z.number()]).transform(String);
const optStr = z.union([looseStr, z.null()]).optional();

const rawCreate = z.object({
  title: looseStr,
  description: optStr,
  project: optStr,
  assignee: optStr,
  priority: optStr,
  status: optStr,
  dueDate: optStr,
  due_date: optStr,
  tags: z.union([z.array(looseStr), looseStr, z.null()]).optional(),
});

const rawUpdate = z.object({
  taskId: looseStr,
  changes: z
    .object({
      title: optStr,
      description: optStr,
      project: optStr,
      assignee: optStr,
      priority: optStr,
      status: optStr,
      dueDate: optStr,
      due_date: optStr,
      tags: z.union([z.array(looseStr), looseStr, z.null()]).optional(),
    })
    .partial(),
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

export function normalizeStatus(v: string | null | undefined): Status | null {
  if (!v) return null;
  const n = norm(v).replace(/ /g, "");
  const map: Record<string, Status> = {
    backlog: "BACKLOG",
    todo: "TODO",
    inprogress: "IN_PROGRESS",
    doing: "IN_PROGRESS",
    wip: "IN_PROGRESS",
    review: "REVIEW",
    inreview: "REVIEW",
    done: "DONE",
    completed: "DONE",
    complete: "DONE",
  };
  return map[n] ?? null;
}

export function normalizePriority(v: string | null | undefined): Priority | null {
  if (!v) return null;
  const n = norm(v);
  const map: Record<string, Priority> = { low: "LOW", medium: "MEDIUM", normal: "MEDIUM", high: "HIGH", urgent: "URGENT", critical: "URGENT" };
  return map[n] ?? null;
}

/** Case-insensitive match: exact name, then unique first-name / prefix, then unique substring. */
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

const UNASSIGNED = new Set(["", "none", "null", "unassigned", "nobody", "no one"]);

function parseTags(v: unknown): string[] {
  const arr = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(",") : [];
  return [...new Set(arr.map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean))].slice(0, 20);
}

function parseDate(v: string | null | undefined): { value: string | null; flag?: string } {
  if (v === null || v === undefined || v === "" || norm(v) === "null" || norm(v) === "none") return { value: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))) return { value: v };
  return { value: null, flag: `Couldn't read date "${v}"` };
}

function resolveAssignee(ctx: DraftContext, raw: string | null | undefined, flags: DraftFlags) {
  if (raw === undefined) return undefined;
  if (raw === null || UNASSIGNED.has(norm(raw))) return { id: null, name: null };
  const u = matchByName(ctx.users, raw);
  if (!u) {
    flags.assignee = `Not found – pick a user ("${raw}")`;
    return { id: null, name: raw };
  }
  return { id: u.id, name: u.name };
}

function resolveProject(ctx: DraftContext, raw: string | null | undefined, flags: DraftFlags) {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const p = matchByName(ctx.projects, raw);
  if (!p) {
    flags.project = `Not found – pick a project ("${raw}")`;
    return { id: null, name: raw };
  }
  return { id: p.id, name: p.name };
}

/** Validate and resolve the LLM's answer against known projects/users/tasks. */
export function parseDraftResponse(input: string | unknown, ctx: DraftContext): DraftResult {
  const json = typeof input === "string" ? extractJson(input) : input;
  const top = rawResponse.safeParse(json);
  if (!top.success) throw new DraftParseError("The AI reply did not match the expected task format.");

  const warnings: string[] = [];
  const creates: DraftTask[] = [];
  const updates: DraftUpdate[] = [];

  top.data.creates.slice(0, 50).forEach((item, idx) => {
    const r = rawCreate.safeParse(item);
    if (!r.success || !r.data.title.trim()) {
      warnings.push(`Skipped draft #${idx + 1}: missing title.`);
      return;
    }
    const c = r.data;
    const flags: DraftFlags = {};
    const project = resolveProject(ctx, c.project, flags);
    if (!project) flags.project = "Pick a project";
    const assignee = resolveAssignee(ctx, c.assignee, flags);
    const priority = normalizePriority(c.priority);
    if (c.priority && !priority) flags.priority = `Unknown priority "${c.priority}"`;
    const status = normalizeStatus(c.status);
    if (c.status && !status) flags.status = `Unknown status "${c.status}"`;
    const due = parseDate(c.dueDate ?? c.due_date);
    if (due.flag) flags.dueDate = due.flag;

    creates.push({
      title: c.title.trim().slice(0, 200),
      description: (c.description ?? "").trim(),
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
      assigneeId: assignee?.id ?? null,
      assigneeName: assignee?.name ?? null,
      priority: priority ?? "MEDIUM",
      status: status ?? "BACKLOG",
      dueDate: due.value,
      tags: parseTags(c.tags),
      flags,
    });
  });

  top.data.updates.slice(0, 100).forEach((item, idx) => {
    const r = rawUpdate.safeParse(item);
    if (!r.success) {
      warnings.push(`Skipped update #${idx + 1}: invalid format.`);
      return;
    }
    const task = ctx.tasks.find((t) => t.id === r.data.taskId);
    if (!task) {
      warnings.push(`Skipped update #${idx + 1}: task "${r.data.taskId}" not found.`);
      return;
    }
    const ch = r.data.changes;
    const flags: DraftFlags = {};
    const before: TaskFields = {};
    const after: TaskFields = {};
    const set = <K extends keyof TaskFields>(key: K, next: TaskFields[K], prev: TaskFields[K]) => {
      if (JSON.stringify(next) === JSON.stringify(prev)) return;
      before[key] = prev;
      after[key] = next;
    };

    if (ch.title) set("title", ch.title.trim(), task.title);
    if (ch.description !== undefined && ch.description !== null) set("description", ch.description, undefined);
    if (ch.status) {
      const s = normalizeStatus(ch.status);
      if (s) set("status", s, task.status);
      else flags.status = `Unknown status "${ch.status}"`;
    }
    if (ch.priority) {
      const p = normalizePriority(ch.priority);
      if (p) set("priority", p, task.priority);
      else flags.priority = `Unknown priority "${ch.priority}"`;
    }
    if (ch.assignee !== undefined) {
      const a = resolveAssignee(ctx, ch.assignee, flags);
      if (a && !flags.assignee) set("assigneeId", a.id, task.assigneeId);
    }
    if (ch.project) {
      const p = resolveProject(ctx, ch.project, flags);
      if (p?.id) set("projectId", p.id, task.projectId);
    }
    const rawDue = ch.dueDate !== undefined ? ch.dueDate : ch.due_date;
    if (rawDue !== undefined) {
      const d = parseDate(rawDue);
      if (d.flag) flags.dueDate = d.flag;
      else set("dueDate", d.value, task.dueDate);
    }
    if (ch.tags !== undefined) set("tags", parseTags(ch.tags), task.tags);

    if (Object.keys(after).length === 0 && Object.keys(flags).length === 0) {
      warnings.push(`No change needed for "${task.title}".`);
      return;
    }
    updates.push({ taskId: task.id, taskTitle: task.title, before, after, flags });
  });

  const message = top.data.message ?? undefined;
  return { creates, updates, warnings, message: message || undefined };
}

// ---------- Prompt for the LLM ----------

export function buildMessages(prompt: string, ctx: DraftContext) {
  const userName = (id: string | null) => ctx.users.find((u) => u.id === id)?.name ?? null;
  const projectName = (id: string) => ctx.projects.find((p) => p.id === id)?.name ?? "";
  const system = [
    "You help the admin of a frontend team's backlog. Turn the admin's request into DRAFT task creations and/or updates.",
    "Reply with ONE JSON object only, no prose, using exactly this shape:",
    '{"creates":[{"title":string,"description":string,"project":string,"assignee":string|null,"priority":"LOW"|"MEDIUM"|"HIGH"|"URGENT","status":"BACKLOG"|"TODO"|"IN_PROGRESS"|"REVIEW"|"DONE","dueDate":"YYYY-MM-DD"|null,"tags":string[]}],',
    ' "updates":[{"taskId":string,"changes":{"status"?:...,"priority"?:...,"assignee"?:string|null,"dueDate"?:"YYYY-MM-DD"|null,"title"?:string,"tags"?:string[],"project"?:string}}],',
    ' "message":string}',
    "Rules: use project and user names exactly as listed. Only reference taskIds from the task list. Use creates for new work and updates for changes to existing tasks.",
    "Defaults when not specified: priority MEDIUM, status BACKLOG, assignee null, dueDate null. Keep titles short (under 80 chars) and specific to frontend work.",
    "Never invent projects or users; if a name doesn't match, still write the name you were given so the admin can fix it.",
    `Today is ${ctx.today}. Resolve relative dates against today.`,
  ].join("\n");
  const context = {
    projects: ctx.projects.map((p) => p.name),
    users: ctx.users.map((u) => u.name),
    statuses: TASK_STATUSES,
    priorities: TASK_PRIORITIES,
    tasks: ctx.tasks.map((t) => ({
      taskId: t.id,
      title: t.title,
      project: projectName(t.projectId),
      assignee: userName(t.assigneeId),
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
    })),
  };
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: `Context:\n${JSON.stringify(context)}\n\nRequest: ${prompt}` },
  ];
}

// ---------- Deterministic mock (dev only, clearly labelled in the UI) ----------

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1 };

/** Produces an LLM-shaped JSON string from simple keyword rules, so the whole flow works without an API key. */
export function mockLlmReply(prompt: string, ctx: DraftContext): string {
  const p = prompt.toLowerCase();
  const findUser = () => ctx.users.find((u) => p.includes(u.name.toLowerCase()) || new RegExp(`\\b${u.name.split(" ")[0].toLowerCase()}\\b`).test(p));
  const findProject = () => {
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
  };
  const prio = TASK_PRIORITIES.find((x) => p.includes(x.toLowerCase()));
  const user = findUser();
  const project = findProject();

  const moveMatch = p.match(/\b(?:move|mark|set|change)\b.*\bto\s+(backlog|to ?do|in ?progress|review|done)\b/);
  if (moveMatch) {
    const status = normalizeStatus(moveMatch[1]);
    const matches = ctx.tasks.filter(
      (t) => (!user || t.assigneeId === user.id) && (!project || t.projectId === project.id) && t.status !== status,
    );
    return JSON.stringify({
      creates: [],
      updates: matches.slice(0, 10).map((t) => ({ taskId: t.id, changes: { status } })),
      message: `Mock AI: proposing ${matches.length} status change(s).`,
    });
  }

  const countMatch = p.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s+(?:new\s+)?tasks?\b/);
  const count = Math.min(10, Math.max(1, countMatch ? Number(countMatch[1]) || WORDS[countMatch[1]] || 1 : 1));
  const forMatch = prompt.match(/\bfor (?:the )?(.+?)(?:,|\.|$| with | assign)/i);
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
  const assigneeWord = prompt.match(/assign(?:ed)? to ([A-Za-z]+(?: [A-Za-z]+)?)/i)?.[1];
  return JSON.stringify({
    creates: Array.from({ length: count }, (_, i) => ({
      title: `${ideas[i % ideas.length]} – ${topic}`,
      description: `Drafted by the mock AI from: "${prompt}"`,
      project: project?.name ?? topic,
      assignee: user?.name ?? assigneeWord ?? null,
      priority: prio ?? "MEDIUM",
      status: "BACKLOG",
      dueDate: null,
      tags: ["ai-draft"],
    })),
    updates: [],
    message: `Mock AI: drafted ${count} task(s).`,
  });
}
