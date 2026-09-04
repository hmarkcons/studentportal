-- staff.photo_path (migration 0006) has existed since the original staff
-- schema but never had any upload path — no storage policy's prefix
-- condition matches a "staff-photos/..." path, so any upload attempt would
-- fail. Same top-level-prefix carve-out pattern as 0046/0079: readable by
-- any active staff (shown on a registered student's Dashboard, in the
-- assigned counselor/processing officer section), writable only by
-- Super Admin — mirrors staff_write's own RLS on the `staff` table itself.
create policy "documents_storage_staff_photos_select" on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'staff-photos' and is_active_staff());

create policy "documents_storage_staff_photos_write" on storage.objects for all
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'staff-photos' and is_super_admin())
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = 'staff-photos' and is_super_admin());
