/**
 * The four work sections (Tasks, Roadmap, R&D, POC) share one model and one set of routes; this table is
 * the single place that says how they differ.
 */
export const WORK_TYPES = ["TASK", "ROADMAP", "RND", "POC"] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const WORK_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "HOLD", "REJECT"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const POC_OUTCOMES = ["ADOPT", "DROP", "NEEDS_MORE_WORK"] as const;
export type PocOutcome = (typeof POC_OUTCOMES)[number];

/** Type-specific fields (everything else is shared: title, notes, project, status). */
export type ExtraField = "targetPeriod" | "goal" | "timeboxEnd" | "findings" | "outcome";
export const EXTRA_FIELDS: ExtraField[] = ["targetPeriod", "goal", "timeboxEnd", "findings", "outcome"];

export interface WorkTypeMeta {
  /** URL segment under /api and in the app (e.g. /api/tasks, /tasks). */
  path: string;
  /** activity_logs.entity_type */
  entity: "task" | "roadmap" | "rnd" | "poc";
  label: string;
  /** e.g. "task", "roadmap item" (used in messages) */
  noun: string;
  extras: ExtraField[];
}

export const WORK_TYPE_META: Record<WorkType, WorkTypeMeta> = {
  TASK: { path: "tasks", entity: "task", label: "Tasks", noun: "task", extras: [] },
  ROADMAP: { path: "roadmap", entity: "roadmap", label: "Roadmap", noun: "roadmap item", extras: ["targetPeriod"] },
  RND: { path: "rnd", entity: "rnd", label: "R&D", noun: "R&D item", extras: ["goal", "timeboxEnd", "findings"] },
  POC: { path: "poc", entity: "poc", label: "POC", noun: "POC", extras: ["goal", "timeboxEnd", "findings", "outcome"] },
};

export const WORK_ENTITY_TYPES = WORK_TYPES.map((t) => WORK_TYPE_META[t].entity);

export const STATUS_LABEL: Record<WorkStatus, string> = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done", HOLD: "Hold", REJECT: "Reject" };
export const OUTCOME_LABEL: Record<PocOutcome, string> = { ADOPT: "Adopt", DROP: "Drop", NEEDS_MORE_WORK: "Needs more work" };

/** Roadmap target period: a month ("2026-11") or a quarter ("2026-Q4"). */
export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/;
