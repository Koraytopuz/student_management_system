-- CreateTable
CREATE TABLE "exam_questions" (
    "id" SERIAL NOT NULL,
    "exam_id" INTEGER NOT NULL,
    "question_number" INTEGER NOT NULL,
    "correct_option" TEXT,
    "topic_name" TEXT NOT NULL DEFAULT 'Genel',
    "lesson_name" TEXT NOT NULL DEFAULT 'Genel',
    "difficulty" TEXT NOT NULL DEFAULT 'Orta',
    "question_text" TEXT,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_questions_exam_id_idx" ON "exam_questions"("exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_exam_id_question_number_key" ON "exam_questions"("exam_id", "question_number");

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
