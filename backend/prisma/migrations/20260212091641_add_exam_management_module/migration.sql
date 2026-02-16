/*
  Warnings:

  - The values [AYT] on the enum `ExamType` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `lesson_name` to the `exam_result_details` table without a default value. This is not possible if the table is not empty.
  - Added the required column `topic_name` to the `topic_analyses` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StreamType" AS ENUM ('SAYISAL', 'SOZEL', 'ESIT_AGIRLIK');

-- AlterEnum (ranking_scales henüz oluşturulmadığı için sadece exams güncellenir; ranking_scales aşağıda yeni tip ile oluşturulacak)
BEGIN;
CREATE TYPE "ExamType_new" AS ENUM ('LGS', 'TYT', 'AYT_SAY', 'AYT_SOZ', 'AYT_EA', 'ARA_SINIF');
ALTER TABLE "exams" ALTER COLUMN "type" TYPE "ExamType_new" USING ("type"::text::"ExamType_new");
ALTER TYPE "ExamType" RENAME TO "ExamType_old";
ALTER TYPE "ExamType_new" RENAME TO "ExamType";
DROP TYPE "public"."ExamType_old";
COMMIT;

-- AlterTable
ALTER TABLE "class_groups" ADD COLUMN     "stream" "StreamType";

-- AlterTable
ALTER TABLE "exam_result_details" ADD COLUMN     "lesson_name" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "question_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "topic_analyses" ADD COLUMN     "lost_points" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "net" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "topic_name" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "exam_assignments" (
    "id" TEXT NOT NULL,
    "exam_id" INTEGER NOT NULL,
    "class_group_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_scales" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "exam_type" "ExamType" NOT NULL,
    "score_range_min" DOUBLE PRECISION NOT NULL,
    "score_range_max" DOUBLE PRECISION NOT NULL,
    "estimated_rank" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_scales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_assignments_exam_id_idx" ON "exam_assignments"("exam_id");

-- CreateIndex
CREATE INDEX "exam_assignments_class_group_id_idx" ON "exam_assignments"("class_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_assignments_exam_id_class_group_id_key" ON "exam_assignments"("exam_id", "class_group_id");

-- CreateIndex
CREATE INDEX "ranking_scales_year_exam_type_idx" ON "ranking_scales"("year", "exam_type");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_scales_year_exam_type_score_range_min_score_range_m_key" ON "ranking_scales"("year", "exam_type", "score_range_min", "score_range_max");

-- CreateIndex
CREATE INDEX "topic_analyses_priority_level_idx" ON "topic_analyses"("priority_level");

-- AddForeignKey
ALTER TABLE "exam_assignments" ADD CONSTRAINT "exam_assignments_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_assignments" ADD CONSTRAINT "exam_assignments_class_group_id_fkey" FOREIGN KEY ("class_group_id") REFERENCES "class_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
