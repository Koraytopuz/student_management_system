-- CreateTable
CREATE TABLE "student_focus_sessions" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "xp_earned" INTEGER NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_focus_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_focus_sessions_student_id_idx" ON "student_focus_sessions"("student_id");

-- AddForeignKey
ALTER TABLE "student_focus_sessions" ADD CONSTRAINT "student_focus_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
