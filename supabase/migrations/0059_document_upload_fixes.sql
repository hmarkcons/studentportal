-- Bug found while auditing document upload: self-students only had
-- select/insert storage policies for the 'documents' bucket
-- (0011_applications_documents.sql / 0047_safe_uuid_storage_policies.sql).
-- Every upload writes to the same fixed path (`${studentId}/${documentId}-${file.name}`)
-- with `upsert: true` — re-uploading a file with the same original filename
-- (the common "fix a rejected document and resubmit" flow) requires an
-- UPDATE on that storage object, which students never had permission for.
-- The upload would silently fail with a raw Postgres/storage RLS error.
create policy "documents_storage_update_self" on storage.objects for update
  using (bucket_id = 'documents' and is_own_student(safe_uuid((storage.foldername(name))[1])))
  with check (bucket_id = 'documents' and is_own_student(safe_uuid((storage.foldername(name))[1])));
