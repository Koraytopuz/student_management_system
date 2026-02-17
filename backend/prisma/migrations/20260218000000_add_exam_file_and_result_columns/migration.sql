-- AlterTable: Add file_url and file_name to exams (optional, for PDF uploads)
ALTER TABLE "exams" ADD COLUMN "file_url" TEXT;
ALTER TABLE "exams" ADD COLUMN "file_name" TEXT;

-- AlterTable: Add answers (JSON) and grading_status to exam_results
ALTER TABLE "exam_results" ADD COLUMN "answers" JSONB;
ALTER TABLE "exam_results" ADD COLUMN "grading_status" TEXT NOT NULL DEFAULT 'graded';
