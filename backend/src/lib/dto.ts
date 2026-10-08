import type { Prisma } from "@prisma/client";

/** Date-only columns are returned as "YYYY-MM-DD". */
export const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const toDate = (s: string | null | undefined) => (s === undefined ? undefined : s === null ? null : new Date(`${s}T00:00:00.000Z`));

export const taskInclude = {
  project: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, active: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.TaskInclude;

export type TaskWithRefs = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function taskDto(t: TaskWithRefs) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    projectId: t.projectId,
    project: t.project,
    assigneeId: t.assigneeId,
    assignee: t.assignee,
    priority: t.priority,
    status: t.status,
    dueDate: ymd(t.dueDate),
    tags: t.tags,
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export const PRIORITY_RANK = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
