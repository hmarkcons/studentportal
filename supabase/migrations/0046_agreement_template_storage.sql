-- The new Setup > Agreement Templates page uploads to a top-level
-- "agreement-templates/..." prefix in the existing 'documents' bucket —
-- separate from the "<student_id>/..." convention every other storage
-- policy assumes (same pattern as 0019's commission-proof/partner-exchange
-- carve-outs). Without this, casting "agreement-templates" to uuid in the
-- existing policies throws, and the upload silently fails.
create policy "documents_storage_agreement_templates" on storage.objects for all
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'agreement-templates' and is_active_staff())
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = 'agreement-templates' and is_active_staff());
