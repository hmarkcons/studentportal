-- HMARK CRM rebuild — step 31: real bug found while testing the new
-- student self-service Profile page (Module 2C, this same pass).
--
-- `log_audit_event()` (0006) inserts `actor_id = auth.uid()` on every
-- audited table (staff, leads, student_profiles, student_documents,
-- program_commission_rates, staff_commissions), but `audit_log.actor_id`
-- had a hard FK to `staff(id)`. A student self-updating their own `leads`
-- row (RLS-legal since 0022) or their own `student_profiles` row (RLS-legal
-- since 0009) triggers this same audit function with a non-staff
-- auth.uid() — the FK violation aborts the entire triggering UPDATE, not
-- just the audit insert, so the student's own legitimate profile edit
-- failed outright. This was latent (not previously caught) because no UI
-- ever exercised student self-write to these tables before this pass.
--
-- Exact same bug class already fixed once for
-- `application_stage_history.changed_by` in migration 0024 (partner-
-- initiated stage changes broke the same way) — same fix here: retarget
-- the FK to auth.users(id), which covers every real actor type, instead of
-- staff(id) alone.
--
-- Run after 0034_partner_program_management.sql.

alter table audit_log drop constraint if exists audit_log_actor_id_fkey;
alter table audit_log add constraint audit_log_actor_id_fkey
  foreign key (actor_id) references auth.users (id);
