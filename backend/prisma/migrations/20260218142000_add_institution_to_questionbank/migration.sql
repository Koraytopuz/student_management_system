-- Add institution_name column to question_bank table for multi-tenant support
ALTER TABLE "question_bank"
ADD COLUMN IF NOT EXISTS "institution_name" TEXT;

