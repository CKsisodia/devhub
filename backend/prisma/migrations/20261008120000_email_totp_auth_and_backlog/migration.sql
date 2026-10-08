-- v1.2: SuperTokens phone OTP -> email + password + TOTP; Jira-style tasks -> notes-like backlog items.
-- Written to be safe on a database that already has data: tasks are copied into backlog_items and
-- existing users get a placeholder email and an unusable password (an admin, or `npm run db:seed` in dev,
-- must set real credentials afterwards).

-- ---------- Backlog ----------
CREATE TYPE "BacklogStatus" AS ENUM ('IN_PROGRESS', 'HOLD', 'DONE', 'REJECT');

CREATE TABLE "backlog_items" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "project_id" UUID,
    "status" "BacklogStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backlog_items_pkey" PRIMARY KEY ("id")
);

INSERT INTO "backlog_items" ("id", "title", "notes", "project_id", "status", "created_by", "created_at", "updated_at")
SELECT "id", "title", "description", "project_id",
       (CASE WHEN "status" = 'DONE' THEN 'DONE' ELSE 'IN_PROGRESS' END)::"BacklogStatus",
       "created_by", "created_at", "updated_at"
FROM "tasks";

UPDATE "activity_logs" SET "entity_type" = 'backlog' WHERE "entity_type" = 'task';

ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assignee_id_fkey";
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_created_by_fkey";
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_project_id_fkey";
DROP TABLE "tasks";
DROP TYPE "TaskPriority";
DROP TYPE "TaskStatus";

CREATE INDEX "backlog_items_project_id_idx" ON "backlog_items"("project_id");
CREATE INDEX "backlog_items_status_idx" ON "backlog_items"("status");
ALTER TABLE "backlog_items" ADD CONSTRAINT "backlog_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "backlog_items" ADD CONSTRAINT "backlog_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- Users / auth ----------
DROP INDEX "users_phone_number_key";
DROP INDEX "users_supertokens_user_id_key";

ALTER TABLE "users"
ADD COLUMN "email" TEXT,
ADD COLUMN "password_hash" TEXT,
ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "totp_secret_enc" TEXT,
ADD COLUMN "totp_last_step" INTEGER,
ADD COLUMN "last_login_at" TIMESTAMP(3);

UPDATE "users" SET "email" = 'migrated-' || "id" || '@invalid.local', "password_hash" = '!', "must_change_password" = true;

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL, ALTER COLUMN "password_hash" SET NOT NULL;
ALTER TABLE "users" DROP COLUMN "phone_number", DROP COLUMN "supertokens_user_id";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "mfa_verified" BOOLEAN NOT NULL DEFAULT false,
    "pending_totp_secret_enc" TEXT,
    "failed_totp_attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
