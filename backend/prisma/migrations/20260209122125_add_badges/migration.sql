-- CreateEnum
CREATE TYPE "BadgeCategory" AS ENUM ('questions_solved', 'tests_completed', 'assignments_completed', 'content_watched', 'streak', 'mixed');

-- CreateTable
CREATE TABLE "badge_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "BadgeCategory" NOT NULL,
    "target_value" INTEGER NOT NULL,
    "metric_key" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badge_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_badges" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),

    CONSTRAINT "student_badges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "badge_definitions_code_key" ON "badge_definitions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "student_badges_student_id_badge_id_key" ON "student_badges"("student_id", "badge_id");

-- AddForeignKey
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badge_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
