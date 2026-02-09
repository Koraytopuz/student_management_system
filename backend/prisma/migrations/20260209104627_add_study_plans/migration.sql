-- CreateTable
CREATE TABLE "study_plans" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "focus_topic" TEXT,
    "weekly_hours" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_plans_student_id_created_at_idx" ON "study_plans"("student_id", "created_at");
