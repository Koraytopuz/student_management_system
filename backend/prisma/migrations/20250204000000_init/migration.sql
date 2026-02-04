-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'teacher', 'student', 'parent');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('video', 'audio', 'document');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('multiple_choice', 'true_false', 'open_ended');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('teacher_student', 'teacher_student_parent', 'class');

-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('pending', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "TodoPriority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('weekly_questions', 'weekly_tests', 'topic_completion', 'score_percent');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('active', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "TeacherAnnouncementStatus" AS ENUM ('draft', 'planned', 'sent');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('assignment_created', 'assignment_due_soon', 'assignment_overdue', 'test_result_ready', 'meeting_scheduled', 'weekly_summary', 'message_received', 'goal_achieved', 'content_assigned');

-- CreateEnum
CREATE TYPE "RelatedEntityType" AS ENUM ('assignment', 'test', 'meeting', 'message', 'content');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('low_activity', 'performance_decline', 'assignment_neglect');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('active', 'resolved', 'dismissed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "password_hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subject_areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "grade_level" TEXT,
    "class_id" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_students" (
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,

    CONSTRAINT "parent_students_pkey" PRIMARY KEY ("parentId","studentId")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade_level" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,

    CONSTRAINT "class_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_group_students" (
    "classGroupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,

    CONSTRAINT "class_group_students_pkey" PRIMARY KEY ("classGroupId","studentId")
);

-- CreateTable
CREATE TABLE "contents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ContentType" NOT NULL,
    "subject_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "grade_level" TEXT NOT NULL,
    "duration_minutes" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_class_groups" (
    "contentId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,

    CONSTRAINT "content_class_groups_pkey" PRIMARY KEY ("contentId","classGroupId")
);

-- CreateTable
CREATE TABLE "content_students" (
    "contentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,

    CONSTRAINT "content_students_pkey" PRIMARY KEY ("contentId","studentId")
);

-- CreateTable
CREATE TABLE "tests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "created_by_teacher_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "choices" JSONB,
    "correct_answer" TEXT,
    "solution_explanation" TEXT,
    "topic" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "test_id" TEXT,
    "content_id" TEXT,
    "class_id" TEXT,
    "due_date" TIMESTAMP(3) NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_students" (
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,

    CONSTRAINT "assignment_students_pkey" PRIMARY KEY ("assignmentId","studentId")
);

-- CreateTable
CREATE TABLE "test_results" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "correct_count" INTEGER NOT NULL,
    "incorrect_count" INTEGER NOT NULL,
    "blank_count" INTEGER NOT NULL,
    "score_percent" DOUBLE PRECISION NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_result_answers" (
    "id" TEXT NOT NULL,
    "test_result_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "scratchpad_image_data" TEXT,

    CONSTRAINT "test_result_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watch_records" (
    "id" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "watched_seconds" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "last_watched_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "type" "MeetingType" NOT NULL,
    "title" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "meeting_url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_students" (
    "meetingId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,

    CONSTRAINT "meeting_students_pkey" PRIMARY KEY ("meetingId","studentId")
);

-- CreateTable
CREATE TABLE "meeting_parents" (
    "meetingId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,

    CONSTRAINT "meeting_parents_pkey" PRIMARY KEY ("meetingId","parentId")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT NOT NULL,
    "student_id" TEXT,
    "subject" TEXT,
    "text" TEXT NOT NULL,
    "attachments" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "related_entity_type" "RelatedEntityType",
    "related_entity_id" TEXT,
    "read_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todos" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TodoStatus" NOT NULL DEFAULT 'pending',
    "priority" "TodoPriority" NOT NULL DEFAULT 'medium',
    "planned_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "related_assignment_id" TEXT,
    "related_content_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "type" "GoalType" NOT NULL,
    "target_value" INTEGER NOT NULL,
    "topic" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_goals" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "created_by_parent_id" TEXT NOT NULL,
    "type" "GoalType" NOT NULL,
    "target_value" INTEGER NOT NULL,
    "topic" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'active',
    "reward" TEXT,
    "completed_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_announcements" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "TeacherAnnouncementStatus" NOT NULL DEFAULT 'draft',
    "scheduled_date" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_feedbacks" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "teacher_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "related_test_id" TEXT,
    "related_assignment_id" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'active',
    "related_data" JSONB,
    "resolved_at" TIMESTAMP(3),
    "detected_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_reports" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "week_start_date" TIMESTAMP(3) NOT NULL,
    "week_end_date" TIMESTAMP(3) NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "summary" JSONB NOT NULL,
    "comparison" JSONB,
    "topic_performance" JSONB,
    "teacher_feedback" TEXT,
    "recommendations" JSONB,

    CONSTRAINT "weekly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_reports" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "summary" JSONB NOT NULL,
    "weekly_breakdown" JSONB,
    "topic_analysis" JSONB,
    "teacher_evaluation" JSONB,

    CONSTRAINT "monthly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_reports" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "report_type" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "data" JSONB,
    "error" TEXT,

    CONSTRAINT "custom_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_role_key" ON "users"("email", "role");

-- CreateIndex
CREATE UNIQUE INDEX "test_result_answers_test_result_id_question_id_key" ON "test_result_answers"("test_result_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "watch_records_content_id_student_id_key" ON "watch_records"("content_id", "student_id");

-- AddForeignKey
ALTER TABLE "parent_students" ADD CONSTRAINT "parent_students_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_students" ADD CONSTRAINT "parent_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_group_students" ADD CONSTRAINT "class_group_students_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "class_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_group_students" ADD CONSTRAINT "class_group_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_class_groups" ADD CONSTRAINT "content_class_groups_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_class_groups" ADD CONSTRAINT "content_class_groups_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "class_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_students" ADD CONSTRAINT "content_students_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_students" ADD CONSTRAINT "content_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_students" ADD CONSTRAINT "assignment_students_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_students" ADD CONSTRAINT "assignment_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_result_answers" ADD CONSTRAINT "test_result_answers_test_result_id_fkey" FOREIGN KEY ("test_result_id") REFERENCES "test_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_result_answers" ADD CONSTRAINT "test_result_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_records" ADD CONSTRAINT "watch_records_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_records" ADD CONSTRAINT "watch_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_students" ADD CONSTRAINT "meeting_students_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_students" ADD CONSTRAINT "meeting_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_parents" ADD CONSTRAINT "meeting_parents_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_parents" ADD CONSTRAINT "meeting_parents_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
