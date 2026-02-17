/*
  Warnings:

  - Changed the type of `exam_type` on the `ranking_scales` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterEnum
ALTER TYPE "ExamType" ADD VALUE 'AYT';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'exam_created';

-- AlterEnum
ALTER TYPE "RelatedEntityType" ADD VALUE 'exam';

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "image_url" TEXT;

-- AlterTable
ALTER TABLE "ranking_scales" DROP COLUMN "exam_type",
ADD COLUMN     "exam_type" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "class_attendances" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "class_group_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_schedule_entries" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "grade_level" TEXT,
    "subject_id" TEXT,
    "student_id" TEXT,
    "day_of_week" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "subject_name" TEXT NOT NULL,
    "topic" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_schedule_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_attendances_teacher_id_date_idx" ON "class_attendances"("teacher_id", "date");

-- CreateIndex
CREATE INDEX "class_attendances_student_id_date_idx" ON "class_attendances"("student_id", "date");

-- CreateIndex
CREATE INDEX "class_attendances_class_group_id_date_idx" ON "class_attendances"("class_group_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "class_attendances_class_group_id_student_id_date_key" ON "class_attendances"("class_group_id", "student_id", "date");

-- CreateIndex
CREATE INDEX "lesson_schedule_entries_teacher_id_scope_grade_level_subjec_idx" ON "lesson_schedule_entries"("teacher_id", "scope", "grade_level", "subject_id", "student_id");

-- CreateIndex
CREATE INDEX "ranking_scales_year_exam_type_idx" ON "ranking_scales"("year", "exam_type");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_scales_year_exam_type_score_range_min_score_range_m_key" ON "ranking_scales"("year", "exam_type", "score_range_min", "score_range_max");

-- AddForeignKey
ALTER TABLE "class_attendances" ADD CONSTRAINT "class_attendances_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_attendances" ADD CONSTRAINT "class_attendances_class_group_id_fkey" FOREIGN KEY ("class_group_id") REFERENCES "class_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_attendances" ADD CONSTRAINT "class_attendances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_schedule_entries" ADD CONSTRAINT "lesson_schedule_entries_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
