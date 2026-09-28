-- A student may see the photos of the two people who look after them.
--
-- The student dashboard shows their counsellor and processing officer the way
-- the staff Dashboard shows them to a colleague: photo, name, designation and
-- the office number and email. The photos live under staff-photos/, which 0100
-- opened to active staff alone.
--
-- The dashboard signs them through avatarUrlMap (src/lib/storageUrls.ts),
-- whose URLs are cached so the browser keeps its copy rather than downloading
-- the photo again on every visit, and it only ever holds the two paths the
-- student's own read of staff returned. This policy is the rule itself, so
-- anything that signs as the student reaches the same two photos and no
-- others.
--
-- Exactly those two photos: the object has to be the photo_path of the staff
-- row set as the calling student's counsellor or processing officer. Reading
-- that row goes through staff's own policy for a student
-- (staff_select_for_own_student, 0289), which allows those two rows and no
-- others, and photo_path is a column 0285 grants. No other staff photo, and
-- nothing else in the folder, becomes readable.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff' and column_name = 'photo_path'
  ) then
    raise exception '0291: staff.photo_path is missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'staff' and policyname = 'staff_select_for_own_student'
  ) then
    raise exception '0291: expects 0289 (staff_select_for_own_student) to be applied first';
  end if;
end $$;

drop policy if exists "documents_storage_staff_photos_select_own_team" on storage.objects;
create policy "documents_storage_staff_photos_select_own_team" on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'staff-photos'
    and exists (
      select 1
      from public.leads l
      join public.staff s on s.id = l.assigned_counselor_id or s.id = l.processing_officer_id
      where l.auth_user_id = auth.uid()
        and s.photo_path = storage.objects.name
    )
  );
