-- Somewhere for a browser to put a file on its way into the portal.
--
-- Every upload used to be posted to a server action, which runs as a Vercel
-- Function — and Vercel refuses any request body over 4.5 MB, whatever the
-- app's own limit says. So a 5 MB document could never have arrived, and the
-- e-signature form, which posts the signed agreement and the consent video
-- together, already failed whenever the two passed 4.5 MB.
--
-- Now the browser puts the file here first, straight into Supabase, and posts
-- only a reference to it. The server action fetches it from here and carries
-- on exactly as before: the same checks, and the same storage policies on the
-- file's real destination, which is still written as the signed-in person.
-- Nothing about who may store what changes; only the route the bytes take.
--
-- Two buckets, because the limit is enforced by Storage itself at the bucket,
-- and a signing video is allowed to be larger than a document:
--
--   upload-staging        5 MB   every document, proof, import and template
--   upload-staging-video  40 MB  the e-signature consent video
--
-- Private, and each person's files are theirs alone: the first folder of the
-- path is their user id, and nobody else — not even staff — can list, read or
-- remove it. src/lib/stagedUpload.ts sweeps a person's staged files once they
-- are a day old, so an abandoned pick does not linger.
--
-- The limits here must match MAX_UPLOAD_BYTES and MAX_VIDEO_SIZE_BYTES.

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('upload-staging', 'upload-staging', false, 5242880),
  ('upload-staging-video', 'upload-staging-video', false, 41943040)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "upload_staging_own_insert" on storage.objects;
create policy "upload_staging_own_insert" on storage.objects for insert
  with check (
    bucket_id in ('upload-staging', 'upload-staging-video')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "upload_staging_own_select" on storage.objects;
create policy "upload_staging_own_select" on storage.objects for select
  using (
    bucket_id in ('upload-staging', 'upload-staging-video')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "upload_staging_own_delete" on storage.objects;
create policy "upload_staging_own_delete" on storage.objects for delete
  using (
    bucket_id in ('upload-staging', 'upload-staging-video')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
