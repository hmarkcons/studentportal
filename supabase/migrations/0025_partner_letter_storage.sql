-- HMARK CRM rebuild — step 21: real bug found while re-testing 0023/0024.
-- `student_documents_insert_partner` (0016) lets a partner insert the DB
-- row for an offer/rejection letter, but no storage policy ever let them
-- upload the underlying file to the "<student_id>/..." path in the first
-- place — the upload itself failed with an RLS error before the row insert
-- was even attempted from the real UI flow.
-- Run after 0024_stage_history_actor_fix.sql.

create policy "documents_storage_partner_letters" on storage.objects for all
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from applications a
      where a.student_id = ((storage.foldername(name))[1])::uuid
        and a.university_id = partner_university_id()
    )
  )
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from applications a
      where a.student_id = ((storage.foldername(name))[1])::uuid
        and a.university_id = partner_university_id()
    )
  );
