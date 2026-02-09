-- AlterTable
ALTER TABLE "coaching_sessions" ADD COLUMN     "meeting_id" TEXT;

-- CreateIndex
CREATE INDEX "coaching_sessions_meeting_id_idx" ON "coaching_sessions"("meeting_id");

-- AddForeignKey
ALTER TABLE "coaching_sessions" ADD CONSTRAINT "coaching_sessions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
