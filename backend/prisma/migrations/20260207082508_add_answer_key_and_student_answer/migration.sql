-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'help_response_played';

-- AlterTable
ALTER TABLE "help_requests" ADD COLUMN     "student_answer" TEXT;

-- AlterTable
ALTER TABLE "help_responses" ADD COLUMN     "played_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "recording_ended_at" TIMESTAMP(3),
ADD COLUMN     "recording_started_at" TIMESTAMP(3),
ADD COLUMN     "recording_url" TEXT;

-- AlterTable
ALTER TABLE "test_assets" ADD COLUMN     "answer_key_json" TEXT;
