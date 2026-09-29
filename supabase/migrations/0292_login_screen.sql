-- The login screen's words, links, colours and picture, for a Super Admin to
-- change on Setup → Login screen.
--
-- The login page was redesigned as a split screen (reference/Login Page/Split
-- Login.png): the story on the left — eyebrow, headline, a line under it, a
-- button and a picture — and the sign-in on the right. Everything a visitor
-- reads there is kept here rather than in the code:
--
--   content     jsonb of the texts, the three links and the two colours. Only
--               what has been changed needs to be present: the app lays this
--               over its own defaults (src/lib/loginScreen.ts), so a key added
--               to the page later needs no migration, and an empty object is
--               the reference design.
--   image_path  the picture, uploaded to the public site-assets bucket; null
--               is the one that ships with the app.
--
-- The page is public; it reads this row through the server's cache
-- (getCachedLoginScreen, service role), so the table is readable only by
-- active staff, for the Setup page. Writing is for whoever may open that
-- page — page.setup.login_screen (0278), a Super Admin's until they grant it.
--
-- The figures 0278 added are no longer on the page. Their table is left
-- alone, with what the office entered, in case they come back.

do $$
begin
  if to_regprocedure('public.staff_has_permission(text)') is null then
    raise exception '0292: public.staff_has_permission(text) is missing';
  end if;
  if not exists (select 1 from public.permission_definitions where key = 'page.setup.login_screen') then
    raise exception '0292: expects 0278 (page.setup.login_screen) to be applied first';
  end if;
end $$;

create table if not exists public.login_screen (
  id boolean primary key default true,
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  image_path text check (image_path is null or image_path like 'login/%'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff (id) on delete set null,
  constraint login_screen_singleton check (id)
);

comment on table public.login_screen is
  'The login page''s texts, links, colours (content, laid over the app''s defaults) and picture (image_path in site-assets). Edited on Setup → Login screen (page.setup.login_screen).';

insert into public.login_screen (id) values (true) on conflict do nothing;

alter table public.login_screen enable row level security;

drop policy if exists "login_screen_select" on public.login_screen;
create policy "login_screen_select" on public.login_screen for select
  using (is_active_staff());

drop policy if exists "login_screen_write" on public.login_screen;
create policy "login_screen_write" on public.login_screen for update
  using (public.staff_has_permission('page.setup.login_screen'))
  with check (public.staff_has_permission('page.setup.login_screen'));

-- --------------------------------------------------------------- the picture
-- A public bucket: the login page is seen by people who are not signed in,
-- and a picture everyone is shown gains nothing from a signed link except a
-- URL that changes and so is never cached. Images only, up to 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Reading goes through the public URL, which needs no policy; these are for
-- uploading, replacing and removing, under login/ only.
drop policy if exists "site_assets_login_select" on storage.objects;
create policy "site_assets_login_select" on storage.objects for select
  using (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'login' and public.staff_has_permission('page.setup.login_screen'));

drop policy if exists "site_assets_login_insert" on storage.objects;
create policy "site_assets_login_insert" on storage.objects for insert
  with check (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'login' and public.staff_has_permission('page.setup.login_screen'));

drop policy if exists "site_assets_login_update" on storage.objects;
create policy "site_assets_login_update" on storage.objects for update
  using (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'login' and public.staff_has_permission('page.setup.login_screen'))
  with check (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'login' and public.staff_has_permission('page.setup.login_screen'));

drop policy if exists "site_assets_login_delete" on storage.objects;
create policy "site_assets_login_delete" on storage.objects for delete
  using (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'login' and public.staff_has_permission('page.setup.login_screen'));

update public.permission_definitions
set description = 'See Login screen under Setup and change what the login page says, where its links go, its colours and its picture.'
where key = 'page.setup.login_screen';

notify pgrst, 'reload schema';
