import { BACKLOG_STATUSES } from "./schemas.js";

type Status = (typeof BACKLOG_STATUSES)[number];

/** Counts per status; progress = done / (all items except rejected ones). */
export function statusCounts(items: { status: Status }[]) {
  const counts = Object.fromEntries(BACKLOG_STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const i of items) counts[i.status]++;
  const total = items.length;
  const relevant = total - counts.REJECT;
  return { counts, total, done: counts.DONE, progress: relevant ? Math.round((counts.DONE / relevant) * 100) : 0 };
}
