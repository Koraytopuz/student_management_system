-- CreateEnum
CREATE TYPE "HelpRequestStatus" AS ENUM ('open', 'in_progress', 'resolved', 'cancelled');

-- CreateEnum
CREATE TYPE "HelpResponseMode" AS ENUM ('audio_only', 'audio_video');

-- CreateEnum
CREATE TYPE "ComplaintFromRole" AS ENUM ('student', 'parent');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('open', 'reviewed', 'closed');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'help_request_created';
ALTER TYPE "NotificationType" ADD VALUE 'help_response_ready';
ALTER TYPE "NotificationType" ADD VALUE 'complaint_created';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RelatedEntityType" ADD VALUE 'test_asset';
ALTER TYPE "RelatedEntityType" ADD VALUE 'help_request';
ALTER TYPE "RelatedEntityType" ADD VALUE 'help_response';
ALTER TYPE "RelatedEntityType" ADD VALUE 'complaint';
ALTER TYPE "RelatedEntityType" ADD VALUE 'teacher_feedback';

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "created_by_teacher_id" TEXT,
ADD COLUMN     "test_asset_id" TEXT,
ADD COLUMN     "time_limit_minutes" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_seen_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "test_assets" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "grade_level" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_requests" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "question_id" TEXT,
    "message" TEXT,
    "status" "HelpRequestStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "help_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_responses" (
    "id" TEXT NOT NULL,
    "help_request_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "mode" "HelpResponseMode" NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
    "from_role" "ComplaintFromRole" NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "about_teacher_id" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "help_requests_teacher_id_status_createdAt_idx" ON "help_requests"("teacher_id", "status", "createdAt");

-- CreateIndex
CREATE INDEX "help_requests_student_id_status_createdAt_idx" ON "help_requests"("student_id", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "help_responses_help_request_id_key" ON "help_responses"("help_request_id");

-- CreateIndex
CREATE INDEX "complaints_status_createdAt_idx" ON "complaints"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_test_asset_id_fkey" FOREIGN KEY ("test_asset_id") REFERENCES "test_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_teacher_id_fkey" FOREIGN KEY ("created_by_teacher_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_assets" ADD CONSTRAINT "test_assets_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_assets" ADD CONSTRAINT "test_assets_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_responses" ADD CONSTRAINT "help_responses_help_request_id_fkey" FOREIGN KEY ("help_request_id") REFERENCES "help_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_responses" ADD CONSTRAINT "help_responses_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_about_teacher_id_fkey" FOREIGN KEY ("about_teacher_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
