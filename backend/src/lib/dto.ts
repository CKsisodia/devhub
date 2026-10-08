import type { Prisma } from "@prisma/client";

/** Date-only columns are returned as "YYYY-MM-DD". */
export const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const toDate = (s: string | null | undefined) => (s === undefined ? undefined : s === null ? null : new Date(`${s}T00:00:00.000Z`));

export const backlogInclude = {
  project: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.BacklogItemInclude;

export type BacklogWithRefs = Prisma.BacklogItemGetPayload<{ include: typeof backlogInclude }>;

export function backlogDto(b: BacklogWithRefs) {
  return {
    id: b.id,
    title: b.title,
    notes: b.notes,
    projectId: b.projectId,
    project: b.project,
    status: b.status,
    createdBy: b.createdBy,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}
