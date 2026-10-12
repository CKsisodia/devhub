-- v1.3: the notes-style backlog becomes "Tasks", one of four work sections (Tasks / Roadmap / R&D / POC)
-- sharing a single work_items table. Existing backlog items are kept as Tasks (same ids, status kept).
-- Adds the "To do" status (default for new items) and the few type-specific columns.

CREATE TYPE "WorkItemType" AS ENUM ('TASK', 'ROADMAP', 'RND', 'POC');
CREATE TYPE "WorkItemStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'HOLD', 'REJECT');
CREATE TYPE "PocOutcome" AS ENUM ('ADOPT', 'DROP', 'NEEDS_MORE_WORK');

ALTER TABLE "backlog_items" RENAME TO "work_items";
ALTER TABLE "work_items" RENAME CONSTRAINT "backlog_items_pkey" TO "work_items_pkey";
ALTER TABLE "work_items" RENAME CONSTRAINT "backlog_items_project_id_fkey" TO "work_items_project_id_fkey";
ALTER TABLE "work_items" RENAME CONSTRAINT "backlog_items_created_by_fkey" TO "work_items_created_by_fkey";
ALTER INDEX "backlog_items_project_id_idx" RENAME TO "work_items_project_id_idx";
DROP INDEX "backlog_items_status_idx";

-- Status: same values plus TODO (new enum type, then convert; avoids ALTER TYPE ... ADD VALUE in a transaction)
ALTER TABLE "work_items" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "work_items" ALTER COLUMN "status" TYPE "WorkItemStatus" USING ("status"::text::"WorkItemStatus");
ALTER TABLE "work_items" ALTER COLUMN "status" SET DEFAULT 'TODO';
DROP TYPE "BacklogStatus";

ALTER TABLE "work_items"
  ADD COLUMN "type" "WorkItemType" NOT NULL DEFAULT 'TASK',
  ADD COLUMN "target_period" TEXT,
  ADD COLUMN "goal" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "timebox_end" DATE,
  ADD COLUMN "findings" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "outcome" "PocOutcome";

CREATE INDEX "work_items_type_status_idx" ON "work_items"("type", "status");

-- Activity log: backlog entries are now task entries
UPDATE "activity_logs" SET "entity_type" = 'task' WHERE "entity_type" = 'backlog';
