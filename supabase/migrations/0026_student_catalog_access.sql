-- HMARK CRM rebuild — step 22: real bug found via a real-browser click-
-- through of the student portal dashboard, not just curl/API assertions.
--
-- `universities_select` / `programs_select` / `destinations_select` (0008)
-- only grant `is_active_staff()`; 0023 later added `universities_select_partner`
-- for partner accounts, but no policy was ever added for a registered
-- student. Every student-portal query that joins from `applications` into
-- `university:universities(name, ...)` (or programs/destinations) is subject
-- to those tables' OWN RLS for the querying role — same nested-RLS class of
-- bug as 0023 — so the join silently returned null and the dashboard/
-- application-detail pages rendered blank university/program names and no
-- pipeline-stage progress, with no error surfaced anywhere.
-- Run after 0025_partner_letter_storage.sql.

create or replace function is_registered_student() returns boolean
language sql security definer stable as $$
  select exists (select 1 from leads where auth_user_id = auth.uid() and registered_at is not null);
$$;

create policy "universities_select_student" on universities for select
  using (is_registered_student());

create policy "programs_select_student" on programs for select
  using (is_registered_student());

create policy "destinations_select_student" on destinations for select
  using (is_registered_student());
