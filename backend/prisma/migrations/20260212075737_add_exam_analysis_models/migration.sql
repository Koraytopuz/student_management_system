-- CreateEnum
CREATE TYPE "HomeworkStatus" AS ENUM ('PENDING', 'COMPLETED', 'LATE');

-- CreateTable
CREATE TABLE "homeworks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "HomeworkStatus" NOT NULL DEFAULT 'PENDING',
    "student_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homeworks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homeworks_student_id_due_date_idx" ON "homeworks"("student_id", "due_date");

-- CreateIndex
CREATE INDEX "homeworks_teacher_id_due_date_idx" ON "homeworks"("teacher_id", "due_date");

-- CreateIndex
CREATE INDEX "homeworks_subject_id_idx" ON "homeworks"("subject_id");

-- AddForeignKey
ALTER TABLE "homeworks" ADD CONSTRAINT "homeworks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homeworks" ADD CONSTRAINT "homeworks_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homeworks" ADD CONSTRAINT "homeworks_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
