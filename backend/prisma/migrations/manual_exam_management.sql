-- Minimal Safe Migration - Only adds new structures, doesn't modify enums
-- This preserves all existing data and avoids enum modification issues

-- Step 1: Create StreamType enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StreamType') THEN
        CREATE TYPE "StreamType" AS ENUM ('SAYISAL', 'SOZEL', 'ESIT_AGIRLIK');
        RAISE NOTICE 'Created StreamType enum';
    ELSE
        RAISE NOTICE 'StreamType enum already exists';
    END IF;
END $$;

-- Step 2: Add stream column to class_groups
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'class_groups' AND column_name = 'stream'
    ) THEN
        ALTER TABLE class_groups ADD COLUMN stream "StreamType";
        RAISE NOTICE 'Added stream column to class_groups';
    ELSE
        RAISE NOTICE 'stream column already exists in class_groups';
    END IF;
END $$;

-- Step 3: Add new columns to exams table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exams' AND column_name = 'question_count') THEN
        ALTER TABLE exams ADD COLUMN question_count INTEGER DEFAULT 0;
        RAISE NOTICE 'Added question_count to exams';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exams' AND column_name = 'description') THEN
        ALTER TABLE exams ADD COLUMN description TEXT;
        RAISE NOTICE 'Added description to exams';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exams' AND column_name = 'created_at') THEN
        ALTER TABLE exams ADD COLUMN created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
        UPDATE exams SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
        RAISE NOTICE 'Added created_at to exams';
    END IF;
END $$;

-- Step 4: Add lessonName to exam_result_details
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exam_result_details' AND column_name = 'lesson_name') THEN
        ALTER TABLE exam_result_details ADD COLUMN lesson_name TEXT DEFAULT '';
        
        -- Populate from subjects
        UPDATE exam_result_details erd
        SET lesson_name = COALESCE(s.name, '')
        FROM subjects s
        WHERE erd.lesson_id = s.id;
        
        GET DIAGNOSTICS updated_count = ROW_COUNT;
        RAISE NOTICE 'Added lesson_name to exam_result_details (populated % rows)', updated_count;
    ELSE
        RAISE NOTICE 'lesson_name already exists in exam_result_details';
    END IF;
END $$;

-- Step 5: Add new columns to topic_analyses
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'topic_analyses' AND column_name = 'topic_name') THEN
        ALTER TABLE topic_analyses ADD COLUMN topic_name TEXT DEFAULT '';
        
        UPDATE topic_analyses ta
        SET topic_name = COALESCE(t.name, '')
        FROM topics t
        WHERE ta.topic_id = t.id;
        
        RAISE NOTICE 'Added topic_name to topic_analyses';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'topic_analyses' AND column_name = 'net') THEN
        ALTER TABLE topic_analyses ADD COLUMN net DOUBLE PRECISION DEFAULT 0;
        
        UPDATE topic_analyses
        SET net = correct - (wrong * 0.25);
        
        GET DIAGNOSTICS updated_count = ROW_COUNT;
        RAISE NOTICE 'Added net to topic_analyses (calculated for % rows)', updated_count;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'topic_analyses' AND column_name = 'lost_points') THEN
        ALTER TABLE topic_analyses ADD COLUMN lost_points DOUBLE PRECISION DEFAULT 0;
        RAISE NOTICE 'Added lost_points to topic_analyses';
    END IF;
END $$;

-- Step 6: Create exam_assignments table
CREATE TABLE IF NOT EXISTS exam_assignments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    exam_id INTEGER NOT NULL,
    class_group_id TEXT NOT NULL,
    assigned_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_assignments_exam_id_fkey') THEN
        ALTER TABLE exam_assignments 
        ADD CONSTRAINT exam_assignments_exam_id_fkey 
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_assignments_class_group_id_fkey') THEN
        ALTER TABLE exam_assignments 
        ADD CONSTRAINT exam_assignments_class_group_id_fkey 
        FOREIGN KEY (class_group_id) REFERENCES class_groups(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_assignments_exam_id_class_group_id_key') THEN
        ALTER TABLE exam_assignments 
        ADD CONSTRAINT exam_assignments_exam_id_class_group_id_key 
        UNIQUE (exam_id, class_group_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'exam_assignments_exam_id_idx') THEN
        CREATE INDEX exam_assignments_exam_id_idx ON exam_assignments(exam_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'exam_assignments_class_group_id_idx') THEN
        CREATE INDEX exam_assignments_class_group_id_idx ON exam_assignments(class_group_id);
    END IF;
    
    RAISE NOTICE 'Created exam_assignments table with constraints and indexes';
END $$;

-- Step 7: Create ranking_scales table (without ExamType for now - we'll use TEXT)
CREATE TABLE IF NOT EXISTS ranking_scales (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    exam_type TEXT NOT NULL,  -- Using TEXT instead of enum to avoid issues
    score_range_min DOUBLE PRECISION NOT NULL,
    score_range_max DOUBLE PRECISION NOT NULL,
    estimated_rank INTEGER NOT NULL,
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ranking_scales_year_exam_type_score_range_min_score_range_max_key') THEN
        ALTER TABLE ranking_scales 
        ADD CONSTRAINT ranking_scales_year_exam_type_score_range_min_score_range_max_key 
        UNIQUE (year, exam_type, score_range_min, score_range_max);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ranking_scales_year_exam_type_idx') THEN
        CREATE INDEX ranking_scales_year_exam_type_idx ON ranking_scales(year, exam_type);
    END IF;
    
    RAISE NOTICE 'Created ranking_scales table with constraints and indexes';
END $$;

-- Step 8: Add index for priority_level in topic_analyses
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'topic_analyses_priority_level_idx') THEN
        CREATE INDEX topic_analyses_priority_level_idx ON topic_analyses(priority_level);
        RAISE NOTICE 'Created priority_level index on topic_analyses';
    ELSE
        RAISE NOTICE 'priority_level index already exists';
    END IF;
END $$;

-- Final message
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration completed successfully!';
    RAISE NOTICE 'All data preserved.';
    RAISE NOTICE 'NOTE: ranking_scales uses TEXT for exam_type';
    RAISE NOTICE 'Next step: Run "npx prisma generate"';
    RAISE NOTICE '========================================';
END $$;
