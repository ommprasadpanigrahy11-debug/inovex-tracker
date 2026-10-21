-- ==============================================================================
-- INOVEX OPERATIONS SENTINEL - PRODUCTION SUPABASE CLOUD POSTGRESQL SCHEMA
-- ==============================================================================
-- Run this entire script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query -> Run)
-- Version: 2.1.0 Hardened (Zero-Trust Deny-by-Default RLS, Strict RBAC)

-- 1. USERS & RBAC TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('founder', 'employee')),
  device_mac_address TEXT NOT NULL,
  skill_set TEXT DEFAULT 'Engineering Operator',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_seen_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- Ensure skill_set, is_active, last_seen_at exist if table was already created
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS skill_set TEXT DEFAULT 'Engineering Operator';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_seen_at BIGINT;

-- 2. TASKS & SPRINT LIFECYCLE TABLE (CANONICAL STATUS MODEL)
-- Allowed statuses: pending, active, review, verified, rejected, failed
CREATE TABLE IF NOT EXISTS public.tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  brief_content TEXT,
  assigned_to TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  ai_health_score INTEGER NOT NULL DEFAULT 85 CHECK (ai_health_score >= 0 AND ai_health_score <= 100),
  sprint_started_at BIGINT,
  is_acknowledged INTEGER NOT NULL DEFAULT 0,
  screen_tracking_active INTEGER NOT NULL DEFAULT 0,
  proof_of_work_webhook TEXT,
  checkpoint_timer INTEGER NOT NULL DEFAULT 5400,
  proof_url TEXT,
  proof_payload TEXT,
  payload_notes TEXT,
  warning_count INTEGER NOT NULL DEFAULT 0,
  session_terminated INTEGER NOT NULL DEFAULT 0,
  termination_reason TEXT,
  deadline TEXT,
  completed_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'active', 'review', 'verified', 'rejected', 'failed'))
);

-- Alter existing constraint safely if needed
DO $$
BEGIN
  ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'active', 'review', 'verified', 'rejected', 'failed'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 3. SUB-SECOND TELEMETRY LOGS & HARDWARE SPOOF SENTINEL
CREATE TABLE IF NOT EXISTS public.telemetry_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES public.tasks(id) ON DELETE SET NULL,
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  active_window TEXT NOT NULL,
  keystroke_rate NUMERIC NOT NULL DEFAULT 0,
  hardware_spoof_flag INTEGER NOT NULL DEFAULT 0,
  screenshot_url TEXT
);

-- 4. 90-MINUTE SPRINT VIDEO AUDITS & AI ANOMALIES
CREATE TABLE IF NOT EXISTS public.sprint_audits (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES public.tasks(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'desktop',
  video_filename TEXT NOT NULL,
  video_url TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 5400,
  ai_health_score INTEGER NOT NULL DEFAULT 85,
  anomaly_count INTEGER NOT NULL DEFAULT 0,
  anomalies_json JSONB DEFAULT '[]'::JSONB,
  focus_breakdown_json JSONB DEFAULT '{"sprint_work":85,"docs_research":10,"flagged_or_idle":5}'::JSONB,
  ai_summary TEXT,
  verdict TEXT NOT NULL DEFAULT 'CLEAN_VERIFIED',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_telemetry_user_time ON public.telemetry_logs (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON public.tasks (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_sprint_audits_time ON public.sprint_audits (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);

-- ==============================================================================
-- 5. SECURE RBAC HELPER FUNCTION (SECURITY DEFINER)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_founder()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()::text AND role = 'founder'
  ) OR (
    COALESCE(auth.jwt()->>'role', '') = 'founder'
  );
$$;

-- ==============================================================================
-- 6. ENABLE ROW LEVEL SECURITY (RLS) & RESTRICTIVE POLICIES
-- ==============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sprint_audits ENABLE ROW LEVEL SECURITY;

-- Drop legacy permissive policies if present
DROP POLICY IF EXISTS "Allow public read access on users" ON public.users;
DROP POLICY IF EXISTS "Allow public write access on users" ON public.users;
DROP POLICY IF EXISTS "Allow public read access on tasks" ON public.tasks;
DROP POLICY IF EXISTS "Allow public write access on tasks" ON public.tasks;
DROP POLICY IF EXISTS "Allow public read access on telemetry_logs" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow public write access on telemetry_logs" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow public read access on sprint_audits" ON public.sprint_audits;
DROP POLICY IF EXISTS "Allow public write access on sprint_audits" ON public.sprint_audits;

-- ---- POLICIES: USERS ----
-- Authenticated users can view team members
CREATE POLICY "Authenticated users view directory"
ON public.users FOR SELECT
TO authenticated
USING (true);

-- Users can update own profile (name, mac, skill), but CANNOT change role to founder
CREATE POLICY "Users update own profile"
ON public.users FOR UPDATE
TO authenticated
USING (auth.uid()::text = id)
WITH CHECK (
  auth.uid()::text = id AND
  role = (SELECT role FROM public.users WHERE id = auth.uid()::text)
);

-- Founders can manage all users (insert, update, delete)
CREATE POLICY "Founders manage all users"
ON public.users FOR ALL
TO authenticated
USING (public.is_founder());

-- ---- POLICIES: TASKS ----
-- Employees can view tasks assigned to them; Founders can view all tasks
CREATE POLICY "Employees view assigned tasks"
ON public.tasks FOR SELECT
TO authenticated
USING (assigned_to = auth.uid()::text OR public.is_founder());

-- Employees can update tasks assigned to them (status, proof, timer acknowledgements)
CREATE POLICY "Employees update assigned tasks"
ON public.tasks FOR UPDATE
TO authenticated
USING (assigned_to = auth.uid()::text OR public.is_founder())
WITH CHECK (assigned_to = auth.uid()::text OR public.is_founder());

-- Founders can insert, reassign, verify, and delete tasks
CREATE POLICY "Founders full task management"
ON public.tasks FOR ALL
TO authenticated
USING (public.is_founder());

-- ---- POLICIES: TELEMETRY LOGS ----
-- Employees can view their own telemetry; Founders can view all telemetry
CREATE POLICY "Telemetry view policy"
ON public.telemetry_logs FOR SELECT
TO authenticated
USING (user_id = auth.uid()::text OR public.is_founder());

-- Employees can log their own telemetry; Founders can log
CREATE POLICY "Telemetry insert policy"
ON public.telemetry_logs FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid()::text OR public.is_founder());

-- Telemetry logs are immutable: No UPDATE or DELETE policies for standard users
CREATE POLICY "Founders delete telemetry"
ON public.telemetry_logs FOR DELETE
TO authenticated
USING (public.is_founder());

-- ---- POLICIES: SPRINT AUDITS ----
-- Employees view their own video audits; Founders view all
CREATE POLICY "Audits view policy"
ON public.sprint_audits FOR SELECT
TO authenticated
USING (user_id = auth.uid()::text OR public.is_founder());

-- Employees can insert video audit records for their own completed sessions
CREATE POLICY "Audits insert policy"
ON public.sprint_audits FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid()::text OR public.is_founder());

-- Founders can review, update, or purge audits
CREATE POLICY "Founders manage audits"
ON public.sprint_audits FOR ALL
TO authenticated
USING (public.is_founder());

-- ==============================================================================
-- 7. REALTIME PUBLICATION CONFIGURATION
-- ==============================================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetry_logs;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sprint_audits;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ==============================================================================
-- 8. SECURE STORAGE BUCKET FOR SPRINT RECORDINGS
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('sprint-recordings', 'sprint-recordings', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Allow public view for sprint recordings" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload for sprint recordings" ON storage.objects;

-- Authenticated users can view recordings they own or if they are founder
CREATE POLICY "Authorized view for sprint recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'sprint-recordings' AND (
    (storage.foldername(name))[1] = auth.uid()::text OR 
    public.is_founder()
  )
);

-- Authenticated users can upload recordings only to their assigned directory path
CREATE POLICY "Authorized upload for sprint recordings"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sprint-recordings' AND (
    (storage.foldername(name))[1] = auth.uid()::text OR 
    public.is_founder()
  )
);

-- ==============================================================================
-- 9. RLS VERIFICATION & NEGATIVE TESTS (TEST SUITE)
-- ==============================================================================
-- Run these queries to verify denial of unauthorized access:
--
-- TEST 1 (Anonymous Denied):
-- SET ROLE anon;
-- SELECT * FROM public.tasks; -- EXPECTED: 0 rows returned (RLS denied)
-- INSERT INTO public.telemetry_logs (id, user_id, active_window) VALUES ('t1', 'usr_emp_01', 'hack'); -- EXPECTED: Error 42501 (violates RLS)
--
-- TEST 2 (Employee Isolation):
-- SET ROLE authenticated;
-- SET request.jwt.claim.sub = 'usr_emp_01';
-- SELECT * FROM public.tasks WHERE assigned_to = 'usr_emp_02'; -- EXPECTED: 0 rows (cannot view peers' tasks)
--
-- TEST 3 (Privilege Escalation Blocked):
-- UPDATE public.users SET role = 'founder' WHERE id = 'usr_emp_01'; -- EXPECTED: Error or 0 changes
