import type { Prisma } from "@prisma/client";

/** Date-only columns are returned as "YYYY-MM-DD". */
export const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const toDate = (s: string | null | undefined) => (s === undefined ? undefined : s === null ? null : new Date(`${s}T00:00:00.000Z`));

export const workItemInclude = {
  project: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.WorkItemInclude;

export type WorkItemWithRefs = Prisma.WorkItemGetPayload<{ include: typeof workItemInclude }>;

/** Same shape for every section; type-specific fields are null / "" where a section doesn't use them. */
export function workItemDto(w: WorkItemWithRefs) {
  return {
    id: w.id,
    type: w.type,
    title: w.title,
    notes: w.notes,
    projectId: w.projectId,
    project: w.project,
    status: w.status,
    targetPeriod: w.targetPeriod,
    goal: w.goal,
    timeboxEnd: ymd(w.timeboxEnd),
    findings: w.findings,
    outcome: w.outcome,
    createdBy: w.createdBy,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}
