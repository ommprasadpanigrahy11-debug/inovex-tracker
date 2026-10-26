-- ==============================================================================
-- INOVEX TRACKER - CLEAR SEEDED DUMMY DATA (SAFE & TARGETED)
-- ==============================================================================
-- Removes only the pre-seeded demo rows (the fictional Lexven roster, their
-- tasks, telemetry, and the sample audit). Real accounts and data created
-- through the app are left untouched.
--
-- Run in the Supabase SQL Editor: Dashboard -> SQL Editor -> New query -> Run.
-- Re-running is safe (idempotent).

-- Child rows first (in case ON DELETE CASCADE isn't set on every FK).
DELETE FROM public.telemetry_logs
WHERE user_id IN (
  'usr_fnd_01','usr_fnd_02','usr_emp_01','usr_emp_02','usr_emp_03','usr_emp_04'
) OR task_id IN ('tsk_001','tsk_002','tsk_003','tsk_004');

DELETE FROM public.sprint_audits
WHERE user_id IN (
  'usr_fnd_01','usr_fnd_02','usr_emp_01','usr_emp_02','usr_emp_03','usr_emp_04'
) OR task_id IN ('tsk_001','tsk_002','tsk_003','tsk_004');

DELETE FROM public.tasks
WHERE id IN ('tsk_001','tsk_002','tsk_003','tsk_004')
   OR assigned_to IN (
     'usr_fnd_01','usr_fnd_02','usr_emp_01','usr_emp_02','usr_emp_03','usr_emp_04'
   );

DELETE FROM public.users
WHERE id IN (
  'usr_fnd_01','usr_fnd_02','usr_emp_01','usr_emp_02','usr_emp_03','usr_emp_04'
);
