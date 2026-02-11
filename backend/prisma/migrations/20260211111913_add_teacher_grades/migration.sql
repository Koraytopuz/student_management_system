-- CreateEnum
CREATE TYPE "CoachingGoalStatus" AS ENUM ('pending', 'completed', 'missed');

-- CreateEnum
CREATE TYPE "CoachingNoteVisibility" AS ENUM ('teacher_only', 'shared_with_parent');

-- AlterTable
ALTER TABLE "help_requests" ADD COLUMN     "image_url" TEXT,
ALTER COLUMN "assignment_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "target_grade" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "profile_picture_url" TEXT,
ADD COLUMN     "teacher_grades" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "coaching_goals" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" "CoachingGoalStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_notes" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" "CoachingNoteVisibility" NOT NULL DEFAULT 'shared_with_parent',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coaching_goals_student_id_deadline_idx" ON "coaching_goals"("student_id", "deadline");

-- CreateIndex
CREATE INDEX "coaching_goals_coach_id_deadline_idx" ON "coaching_goals"("coach_id", "deadline");

-- CreateIndex
CREATE INDEX "coaching_notes_student_id_date_idx" ON "coaching_notes"("student_id", "date");

-- CreateIndex
CREATE INDEX "coaching_notes_coach_id_date_idx" ON "coaching_notes"("coach_id", "date");

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_goals" ADD CONSTRAINT "coaching_goals_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_goals" ADD CONSTRAINT "coaching_goals_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_notes" ADD CONSTRAINT "coaching_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_notes" ADD CONSTRAINT "coaching_notes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
