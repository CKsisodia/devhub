import { WORK_STATUSES, WORK_TYPES, type WorkStatus, type WorkType } from "./workTypes.js";

/** Counts per status; progress = done / (all items except rejected ones). */
export function statusCounts(items: { status: WorkStatus }[]) {
  const counts = Object.fromEntries(WORK_STATUSES.map((s) => [s, 0])) as Record<WorkStatus, number>;
  for (const i of items) counts[i.status]++;
  const total = items.length;
  const relevant = total - counts.REJECT;
  return { counts, total, done: counts.DONE, progress: relevant ? Math.round((counts.DONE / relevant) * 100) : 0 };
}

/** statusCounts for each of the four work sections. */
export function countsByType(items: { type: WorkType; status: WorkStatus }[]) {
  return Object.fromEntries(WORK_TYPES.map((t) => [t, statusCounts(items.filter((i) => i.type === t))])) as Record<WorkType, ReturnType<typeof statusCounts>>;
}
