-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('pending', 'completed', 'overdue');

-- AlterTable
ALTER TABLE "assignment_students" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "status" "AssignmentStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "submitted_in_live_class" BOOLEAN NOT NULL DEFAULT false;
