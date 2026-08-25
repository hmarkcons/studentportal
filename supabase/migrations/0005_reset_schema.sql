-- HMARK CRM rebuild — step 1: tear down the old "Case Flow" schema (0001-0004).
-- Confirmed with the user that no real data needs to survive this reset.
-- Run after 0004_student_counselor_visibility.sql.

-- ---------------------------------------------------------------------------
-- Storage policies first (they reference is_admin(), which we're dropping)
-- ---------------------------------------------------------------------------

drop policy if exists "documents_storage_access" on storage.objects;
drop policy if exists "documents_storage_select_self" on storage.objects;
drop policy if exists "documents_storage_insert_self" on storage.objects;

-- The 'documents' bucket itself is kept — Module 1E/2D re-scope it once the
-- new student_documents/applications tables exist (see 0011).

-- ---------------------------------------------------------------------------
-- Tables (drop in dependency order; cascade to sweep up their policies)
-- ---------------------------------------------------------------------------

drop table if exists reminders cascade;
drop table if exists notes cascade;
drop table if exists stage_history cascade;
drop table if exists student_documents cascade;
drop table if exists document_templates cascade;
drop table if exists students cascade;
drop table if exists staff cascade;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

drop function if exists is_admin();
drop function if exists set_updated_at();
drop function if exists log_stage_change();
drop function if exists seed_student_documents();
