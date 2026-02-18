-- Add institution_name column to users table
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "institution_name" TEXT;

