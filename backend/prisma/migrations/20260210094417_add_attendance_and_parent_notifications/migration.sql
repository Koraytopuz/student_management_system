-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'exam_result_to_parent';
ALTER TYPE "NotificationType" ADD VALUE 'live_class_attendance';

-- AlterEnum
ALTER TYPE "RelatedEntityType" ADD VALUE 'attendance';

-- CreateTable
CREATE TABLE "meeting_attendances" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meeting_attendances_meeting_id_idx" ON "meeting_attendances"("meeting_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_attendances_meeting_id_student_id_key" ON "meeting_attendances"("meeting_id", "student_id");

-- AddForeignKey
ALTER TABLE "meeting_attendances" ADD CONSTRAINT "meeting_attendances_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendances" ADD CONSTRAINT "meeting_attendances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
