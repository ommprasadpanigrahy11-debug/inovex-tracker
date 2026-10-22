-- ==============================================================================
-- INOVEX TRACKER - PROFILE & ACCOUNT MANAGEMENT MIGRATION (IDEMPOTENT & SAFE)
-- ==============================================================================
-- Run in your Supabase SQL Editor if using Supabase Cloud:
-- Dashboard -> SQL Editor -> New query -> Run

-- 1. Ensure user profile and settings columns exist on public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'dark';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS time_format TEXT DEFAULT '24h';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"in_app":true,"task_assignments":true,"task_deadlines":true,"task_verifications":true,"workspace_announcements":true,"security_alerts":true,"email_notifications":false}'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at BIGINT;

-- 2. Backfill created_at with current timestamp for any legacy rows missing it
UPDATE public.users SET created_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000 WHERE created_at IS NULL;
UPDATE public.users SET timezone = 'UTC' WHERE timezone IS NULL;
UPDATE public.users SET language = 'en' WHERE language IS NULL;
UPDATE public.users SET theme = 'dark' WHERE theme IS NULL;
UPDATE public.users SET time_format = '24h' WHERE time_format IS NULL;
