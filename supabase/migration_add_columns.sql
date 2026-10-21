-- ==============================================================================
-- INOVEX TRACKER - SAFE & IDEMPOTENT SUPABASE CLOUD MIGRATION
-- ==============================================================================
-- Copy and paste this script directly into your Supabase SQL Editor:
-- Supabase Dashboard -> SQL Editor -> New Query -> Run
-- This script is 100% non-destructive and will never delete existing data.

-- 1. Ensure columns exist on public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS skill_set TEXT DEFAULT 'Engineering Operator';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_seen_at BIGINT;

-- 2. Backfill existing records with null values
UPDATE public.users 
SET skill_set = CASE 
  WHEN role = 'founder' THEN 'Executive Director' 
  ELSE 'Engineering Operator' 
END 
WHERE skill_set IS NULL;

UPDATE public.users 
SET is_active = 1 
WHERE is_active IS NULL;

-- 3. Verify public read access policy for anonymous login screen directory
-- Allows unauthenticated visitors on the login screen to see the team roster
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'users' AND policyname = 'Public read directory for login'
  ) THEN
    CREATE POLICY "Public read directory for login"
    ON public.users FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;
END $$;

-- 4. Enable Realtime Replication for users and tasks
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;
