-- CreateEnum
CREATE TYPE "CoachingMode" AS ENUM ('audio', 'video');

-- CreateTable
CREATE TABLE "coaching_sessions" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "mode" "CoachingMode" NOT NULL DEFAULT 'audio',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coaching_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coaching_sessions_student_id_date_idx" ON "coaching_sessions"("student_id", "date");

-- CreateIndex
CREATE INDEX "coaching_sessions_teacher_id_date_idx" ON "coaching_sessions"("teacher_id", "date");

-- AddForeignKey
ALTER TABLE "coaching_sessions" ADD CONSTRAINT "coaching_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_sessions" ADD CONSTRAINT "coaching_sessions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
