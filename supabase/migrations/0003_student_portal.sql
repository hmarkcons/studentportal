-- Case Flow — Phase 2: student self-service portal.
-- Adds a student's own auth account (linked via students.auth_user_id) with
-- tightly scoped access: their own case + document checklist + timeline,
-- and upload rights limited to setting a document to "submitted" — never
-- "verified"/"rejected", which stays staff-only.

alter table students
  add column if not exists auth_user_id uuid unique references auth.users (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Students can read their own case (profile fields, not reassignable by them)
-- ---------------------------------------------------------------------------

create policy "students_select_self" on students for select
  using (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Students can read their own timeline
-- ---------------------------------------------------------------------------

create policy "stage_history_select_self" on stage_history for select
  using (exists (
    select 1 from students st
    where st.id = stage_history.student_id and st.auth_user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- Students can read their own document checklist, and upload a file — but
-- the with-check pins status to 'submitted' so a student can never mark
-- their own document verified/rejected, even by calling the API directly.
-- ---------------------------------------------------------------------------

create policy "student_documents_select_self" on student_documents for select
  using (exists (
    select 1 from students st
    where st.id = student_documents.student_id and st.auth_user_id = auth.uid()
  ));

create policy "student_documents_upload_self" on student_documents for update
  using (exists (
    select 1 from students st
    where st.id = student_documents.student_id and st.auth_user_id = auth.uid()
  ))
  with check (
    status = 'submitted'
    and exists (
      select 1 from students st
      where st.id = student_documents.student_id and st.auth_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: a student may read/upload only under their own student_id folder
-- ---------------------------------------------------------------------------

create policy "documents_storage_select_self" on storage.objects for select
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from students st
      where st.id::text = (storage.foldername(name))[1] and st.auth_user_id = auth.uid()
    )
  );

create policy "documents_storage_insert_self" on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from students st
      where st.id::text = (storage.foldername(name))[1] and st.auth_user_id = auth.uid()
    )
  );
