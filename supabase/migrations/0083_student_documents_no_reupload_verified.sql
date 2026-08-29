-- student_documents_upload_self's `using` clause only checked ownership,
-- not the row's current status — only the `with check` constrained the
-- RESULTING status to 'submitted'. A student could therefore update a
-- document row that was already 'verified' (staff-approved), silently
-- resetting it to 'submitted' and overwriting the approved file, with no
-- staff visibility into the regression. Fix: also require the row's
-- CURRENT status not be 'verified' — students can still upload while
-- missing/submitted/under_review, or fix a rejected document, just never
-- overwrite one staff has already approved.

drop policy if exists "student_documents_upload_self" on student_documents;
create policy "student_documents_upload_self" on student_documents for update
  using (is_own_student(student_id) and status <> 'verified')
  with check (status = 'submitted' and is_own_student(student_id));
