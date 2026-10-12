import { z } from "zod";
import { badRequest } from "./errors.js";
import { EXTRA_FIELDS, PERIOD_RE, POC_OUTCOMES, WORK_STATUSES, WORK_TYPE_META, WORK_TYPES, type WorkType } from "./workTypes.js";

export { WORK_STATUSES, WORK_TYPES };

export const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED"] as const;
export const LEARNING_TYPES = ["BLOG", "ARTICLE", "NEWS"] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

const tags = z.array(z.string().trim().min(1).max(40)).max(20);

// ---------- Work items (Tasks, Roadmap, R&D, POC) ----------
// One schema for all four sections; fields that don't belong to a section are rejected by
// assertExtrasAllowed() in the route (see WORK_TYPE_META.extras).
const extra = {
  targetPeriod: z.string().regex(PERIOD_RE, "Use a month (2026-11) or a quarter (2026-Q4)").nullable(),
  goal: z.string().max(2000),
  timeboxEnd: isoDate.nullable(),
  findings: z.string().max(20000),
  outcome: z.enum(POC_OUTCOMES).nullable(),
};

export const workItemCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: z.string().max(20000).default(""),
  projectId: z.uuid().nullable().optional(),
  status: z.enum(WORK_STATUSES).default("TODO"),
  targetPeriod: extra.targetPeriod.optional(),
  goal: extra.goal.optional(),
  timeboxEnd: extra.timeboxEnd.optional(),
  findings: extra.findings.optional(),
  outcome: extra.outcome.optional(),
});

export const workItemUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    notes: z.string().max(20000),
    projectId: z.uuid().nullable(),
    status: z.enum(WORK_STATUSES),
    ...extra,
  })
  .partial();

export const workItemStatusSchema = z.object({ status: z.enum(WORK_STATUSES) });

export const workItemBulkSchema = z.object({
  creates: z.array(workItemCreateSchema).max(50).default([]),
  updates: z.array(z.object({ id: z.uuid(), patch: workItemUpdateSchema })).max(100).default([]),
});

/** Rejects type-specific fields sent to a section that doesn't use them (e.g. outcome on a Task). */
export function assertExtrasAllowed(type: WorkType, input: Record<string, unknown>) {
  const allowed = WORK_TYPE_META[type].extras;
  const bad = EXTRA_FIELDS.filter((f) => input[f] !== undefined && !allowed.includes(f));
  if (bad.length) throw badRequest(`${bad.join(", ")}: not used for ${WORK_TYPE_META[type].label} items`);
}

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().max(5000).default(""),
  status: z.enum(PROJECT_STATUSES).default("ACTIVE"),
  startDate: isoDate.nullable().optional(),
  targetDate: isoDate.nullable().optional(),
  memberIds: z.array(z.uuid()).default([]),
});

export const projectUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(5000),
    status: z.enum(PROJECT_STATUSES),
    archived: z.boolean(),
    startDate: isoDate.nullable(),
    targetDate: isoDate.nullable(),
  })
  .partial();

export const learningCreateSchema = z
  .object({
    type: z.enum(LEARNING_TYPES),
    title: z.string().trim().min(1, "Title is required").max(200),
    url: z.url().nullable().optional(),
    summary: z.string().max(1000).default(""),
    body: z.string().max(50000).nullable().optional(),
    tags: tags.default([]),
    pinned: z.boolean().default(false),
  })
  .refine((v) => Boolean(v.url) || Boolean(v.body && v.body.trim()), {
    message: "Provide a URL or write a post",
    path: ["url"],
  });

export const learningUpdateSchema = z
  .object({
    type: z.enum(LEARNING_TYPES),
    title: z.string().trim().min(1).max(200),
    url: z.url().nullable(),
    summary: z.string().max(1000),
    body: z.string().max(50000).nullable(),
    tags,
    pinned: z.boolean(),
  })
  .partial();

export const docCreateSchema = z.object({
  projectId: z.uuid().nullable(), // null = General space
  parentId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1, "Title is required").max(200),
  content: z.string().max(200000).default(""),
});

export const docUpdateSchema = z
  .object({
    parentId: z.uuid().nullable(),
    title: z.string().trim().min(1).max(200),
    content: z.string().max(200000),
    position: z.number().int(),
  })
  .partial();

const email = z.email("Enter a valid email address").trim().toLowerCase().max(254);
const tempPassword = z.string().min(10, "Temporary password: at least 10 characters").max(128);

export const userCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email,
  tempPassword,
});

export const userUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email,
    active: z.boolean(),
  })
  .partial();

export const userResetPasswordSchema = z.object({ tempPassword });

export const aiDraftSchema = z.object({
  prompt: z.string().trim().min(3, "Type a request for the AI").max(2000),
  /** Which section the drafts are for; AI creates items of this type only. */
  type: z.enum(WORK_TYPES).default("TASK"),
});
