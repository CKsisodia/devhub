import type { Prisma } from "@prisma/client";

/** Date-only columns are returned as "YYYY-MM-DD". */
export const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const toDate = (s: string | null | undefined) => (s === undefined ? undefined : s === null ? null : new Date(`${s}T00:00:00.000Z`));

export const workItemInclude = {
  project: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  attachments: { select: { id: true, fileName: true, fileUrl: true, mimeType: true, sizeBytes: true, createdAt: true }, orderBy: { createdAt: "asc" } },
  links: { select: { id: true, url: true, label: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.WorkItemInclude;

export type AttachmentRow = { id: string; fileName: string; fileUrl: string; mimeType: string | null; sizeBytes: number | null; createdAt: Date };
export const attachmentDto = (a: AttachmentRow) => ({ id: a.id, fileName: a.fileName, url: a.fileUrl, mimeType: a.mimeType, sizeBytes: a.sizeBytes, createdAt: a.createdAt.toISOString() });

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
    attachments: w.attachments.map(attachmentDto),
    links: w.links,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}
