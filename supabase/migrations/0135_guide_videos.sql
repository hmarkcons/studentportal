-- Make the portal's Guide section manageable from Setup.
--
-- It was a hardcoded array holding exactly one entry, titled "Welcome to your
-- HMARK Student Portal" and pointing at YouTube id dQw4w9WgXcQ — which is
-- Never Gonna Give You Up. A placeholder someone reached for while stubbing the
-- page, live in the student portal. It is deliberately NOT carried over here:
-- the table starts empty and the portal hides the section until staff add a
-- real tutorial.
--
-- Only the provider and the video id are stored, never a pasted URL: the embed
-- src is composed from them (see src/lib/videoEmbed.ts), so the guide cannot be
-- used to frame an arbitrary page inside the portal.

create table if not exists guide_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  provider text not null check (provider in ('youtube', 'vimeo')),
  video_id text not null,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, video_id)
);

drop trigger if exists trg_guide_videos_updated_at on guide_videos;
create trigger trg_guide_videos_updated_at
  before update on guide_videos
  for each row execute function set_updated_at();

alter table guide_videos enable row level security;

-- Reference content shown to students, same class as document_templates and
-- the support FAQ. Unpublished rows are filtered by the page, not by RLS, so
-- staff can see their own drafts.
drop policy if exists "guide_videos_select" on guide_videos;
create policy "guide_videos_select" on guide_videos
  for select using (auth.role() = 'authenticated');

drop policy if exists "guide_videos_write" on guide_videos;
create policy "guide_videos_write" on guide_videos
  for all using (is_active_staff()) with check (is_active_staff());
