-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "mime_type" TEXT,
ADD COLUMN     "size_bytes" INTEGER,
ADD COLUMN     "work_item_id" UUID;

-- CreateTable
CREATE TABLE "work_item_links" (
    "id" UUID NOT NULL,
    "work_item_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_item_links_work_item_id_idx" ON "work_item_links"("work_item_id");

-- CreateIndex
CREATE INDEX "attachments_work_item_id_idx" ON "attachments"("work_item_id");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_links" ADD CONSTRAINT "work_item_links_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
