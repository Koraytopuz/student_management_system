-- CreateEnum
CREATE TYPE "BloomLevel" AS ENUM ('hatirlama', 'anlama', 'uygulama', 'analiz', 'degerlendirme', 'yaratma');

-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('teacher', 'ai', 'import');

-- CreateTable
CREATE TABLE "question_bank" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "grade_level" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "subtopic" TEXT,
    "kazanim_kodu" TEXT,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "choices" JSONB,
    "correct_answer" TEXT NOT NULL,
    "distractor_reasons" JSONB,
    "solution_explanation" TEXT,
    "difficulty" TEXT NOT NULL,
    "bloom_level" "BloomLevel",
    "estimated_minutes" INTEGER,
    "source" "QuestionSource" NOT NULL DEFAULT 'teacher',
    "created_by_teacher_id" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approved_by_teacher_id" TEXT,
    "quality_score" DOUBLE PRECISION,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_topics" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "grade_level" TEXT NOT NULL,
    "unit_number" INTEGER NOT NULL,
    "topic_name" TEXT NOT NULL,
    "kazanim_kodu" TEXT NOT NULL,
    "kazanim_text" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "curriculum_topics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_bank_subject_id_grade_level_topic_idx" ON "question_bank"("subject_id", "grade_level", "topic");

-- CreateIndex
CREATE INDEX "question_bank_difficulty_bloom_level_idx" ON "question_bank"("difficulty", "bloom_level");

-- CreateIndex
CREATE INDEX "question_bank_isApproved_source_idx" ON "question_bank"("isApproved", "source");

-- CreateIndex
CREATE INDEX "curriculum_topics_subject_id_grade_level_idx" ON "curriculum_topics"("subject_id", "grade_level");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_topics_subject_id_grade_level_kazanim_kodu_key" ON "curriculum_topics"("subject_id", "grade_level", "kazanim_kodu");

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
