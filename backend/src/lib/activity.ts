import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type EntityType = "task" | "roadmap" | "rnd" | "poc" | "doc" | "project" | "learning" | "user";

export async function logActivity(
  db: Db,
  entry: {
    userId: string;
    entityType: EntityType;
    entityId: string;
    action: "created" | "updated" | "deleted";
    summary: string;
    projectId?: string | null;
    changes?: Record<string, { from: unknown; to: unknown }> | Record<string, unknown> | null;
  },
) {
  await db.activityLog.create({
    data: {
      userId: entry.userId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      summary: entry.summary,
      projectId: entry.projectId ?? null,
      changes: (entry.changes ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/** Field-level diff between a before-record and a patch (only fields present in the patch). */
export function diff(before: Record<string, unknown>, patch: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, to] of Object.entries(patch)) {
    if (to === undefined) continue;
    const from = before[key];
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);
    if (JSON.stringify(norm(from)) !== JSON.stringify(norm(to))) changes[key] = { from: norm(from), to: norm(to) };
  }
  return changes;
}
