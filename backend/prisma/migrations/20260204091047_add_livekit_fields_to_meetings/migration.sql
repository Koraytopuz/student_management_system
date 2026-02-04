-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "joinMode" TEXT DEFAULT 'internal',
ADD COLUMN     "provider" TEXT DEFAULT 'internal_webrtc',
ADD COLUMN     "roomId" TEXT;
