-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('LGS', 'TYT', 'AYT', 'ARA_SINIF');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('ONE', 'TWO', 'THREE');

-- CreateTable
CREATE TABLE "exams" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ExamType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_results" (
    "id" SERIAL NOT NULL,
    "student_id" TEXT NOT NULL,
    "exam_id" INTEGER NOT NULL,
    "total_net" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "percentile" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_result_details" (
    "id" SERIAL NOT NULL,
    "exam_result_id" INTEGER NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "correct" INTEGER NOT NULL,
    "wrong" INTEGER NOT NULL,
    "empty" INTEGER NOT NULL,
    "net" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "exam_result_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_analyses" (
    "id" SERIAL NOT NULL,
    "exam_result_detail_id" INTEGER NOT NULL,
    "topic_id" TEXT NOT NULL,
    "total_question" INTEGER NOT NULL,
    "correct" INTEGER NOT NULL,
    "wrong" INTEGER NOT NULL,
    "empty" INTEGER NOT NULL,
    "priority_level" "PriorityLevel" NOT NULL,

    CONSTRAINT "topic_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exams_type_idx" ON "exams"("type");

-- CreateIndex
CREATE INDEX "exams_date_idx" ON "exams"("date");

-- CreateIndex
CREATE INDEX "exam_results_student_id_idx" ON "exam_results"("student_id");

-- CreateIndex
CREATE INDEX "exam_results_exam_id_idx" ON "exam_results"("exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_results_student_id_exam_id_key" ON "exam_results"("student_id", "exam_id");

-- CreateIndex
CREATE INDEX "exam_result_details_exam_result_id_idx" ON "exam_result_details"("exam_result_id");

-- CreateIndex
CREATE INDEX "exam_result_details_lesson_id_idx" ON "exam_result_details"("lesson_id");

-- CreateIndex
CREATE INDEX "topic_analyses_exam_result_detail_id_idx" ON "topic_analyses"("exam_result_detail_id");

-- CreateIndex
CREATE INDEX "topic_analyses_topic_id_idx" ON "topic_analyses"("topic_id");

-- AddForeignKey
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_result_details" ADD CONSTRAINT "exam_result_details_exam_result_id_fkey" FOREIGN KEY ("exam_result_id") REFERENCES "exam_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_result_details" ADD CONSTRAINT "exam_result_details_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_analyses" ADD CONSTRAINT "topic_analyses_exam_result_detail_id_fkey" FOREIGN KEY ("exam_result_detail_id") REFERENCES "exam_result_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_analyses" ADD CONSTRAINT "topic_analyses_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
