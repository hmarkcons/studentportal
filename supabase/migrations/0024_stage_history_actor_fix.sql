-- HMARK CRM rebuild — step 20: another real bug found while re-testing the
-- fix from 0023. application_stage_history.changed_by has a foreign key to
-- staff(id), but a partner university account (not staff) can legitimately
-- change an application's stage per the doc's Module 3B — the insert then
-- fails with a foreign key violation since the partner has no staff row.
-- changed_by should reference auth.users(id) instead, which covers staff,
-- students, and partners alike (students never trigger this path today, but
-- there's no reason to bake in "staff only" when the actor is really "any
-- authenticated actor who legitimately changed this row").
-- Run after 0023_partner_rls_fixes.sql.

alter table application_stage_history drop constraint application_stage_history_changed_by_fkey;
alter table application_stage_history
  add constraint application_stage_history_changed_by_fkey foreign key (changed_by) references auth.users (id);

-- Cosmetic accuracy fix found in the same pass: partner-uploaded offer/
-- rejection letters were being labeled uploaded_by_role = 'staff'.
alter table student_documents drop constraint if exists student_documents_uploaded_by_role_check;
alter table student_documents
  add constraint student_documents_uploaded_by_role_check check (uploaded_by_role in ('student', 'staff', 'partner'));
