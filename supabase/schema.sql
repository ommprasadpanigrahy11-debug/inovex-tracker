-- ==============================================================================
-- INOVEX OPERATIONS SENTINEL - PRODUCTION SUPABASE CLOUD POSTGRESQL SCHEMA
-- ==============================================================================
-- Run this entire script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query -> Run)

-- 1. USERS & RBAC TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('founder', 'employee')),
  device_mac_address TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- 2. TASKS & 90-MINUTE SPRINT LIFECYCLE TABLE
CREATE TABLE IF NOT EXISTS public.tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'review', 'verified')),
  ai_health_score INTEGER NOT NULL DEFAULT 85,
  sprint_started_at BIGINT,
  is_acknowledged INTEGER NOT NULL DEFAULT 0,
  screen_tracking_active INTEGER NOT NULL DEFAULT 0,
  proof_url TEXT,
  proof_payload TEXT,
  warning_count INTEGER NOT NULL DEFAULT 0,
  session_terminated INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

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

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_telemetry_user_time ON public.telemetry_logs (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON public.tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_sprint_audits_time ON public.sprint_audits (created_at DESC);

-- ==============================================================================
-- 5. ENABLE ROW LEVEL SECURITY (RLS) & PUBLIC READ/WRITE POLICIES
-- ==============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sprint_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Allow public write access on users" ON public.users FOR ALL USING (true);

CREATE POLICY "Allow public read access on tasks" ON public.tasks FOR SELECT USING (true);
CREATE POLICY "Allow public write access on tasks" ON public.tasks FOR ALL USING (true);

CREATE POLICY "Allow public read access on telemetry_logs" ON public.telemetry_logs FOR SELECT USING (true);
CREATE POLICY "Allow public write access on telemetry_logs" ON public.telemetry_logs FOR ALL USING (true);

CREATE POLICY "Allow public read access on sprint_audits" ON public.sprint_audits FOR SELECT USING (true);
CREATE POLICY "Allow public write access on sprint_audits" ON public.sprint_audits FOR ALL USING (true);

-- ==============================================================================
-- 6. ENABLE SUPABASE REALTIME REPLICATION (For instant sub-second sync)
-- ==============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetry_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sprint_audits;

-- ==============================================================================
-- 7. SUPABASE STORAGE BUCKET FOR 90-MINUTE SPRINT RECORDINGS
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('sprint-recordings', 'sprint-recordings', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow public view for sprint recordings"
ON storage.objects FOR SELECT
USING (bucket_id = 'sprint-recordings');

CREATE POLICY "Allow public upload for sprint recordings"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'sprint-recordings');

-- ==============================================================================
-- 8. PRODUCTION READY (Clean Slate)
-- ==============================================================================
-- All tables are initialized with zero seed data.
-- Founders and Engineers register dynamically via the INOVEX Node Gateway.
--
-- OPTIONAL: To purge existing demo rows from an earlier installation:
-- TRUNCATE TABLE public.telemetry_logs CASCADE;
-- TRUNCATE TABLE public.sprint_audits CASCADE;
-- TRUNCATE TABLE public.tasks CASCADE;
-- TRUNCATE TABLE public.users CASCADE;
