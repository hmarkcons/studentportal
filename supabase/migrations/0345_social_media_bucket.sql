-- Social media library bucket (0345). PUBLIC on purpose: Meta and TikTok pull
-- the media from a public URL when publishing, so objects must be readable
-- without a session. Only the social-capable roles may upload, change or remove
-- them (public read is served straight from the public URL and bypasses RLS).
insert into storage.buckets (id, name, public)
values ('social-media', 'social-media', true)
on conflict (id) do nothing;

create policy "social_media_objects_write" on storage.objects for all
  using (bucket_id = 'social-media' and (select public.is_social_staff()))
  with check (bucket_id = 'social-media' and (select public.is_social_staff()));
