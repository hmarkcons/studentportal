-- A guide for every document a student is asked to upload.
--
-- Written in Setup › Create Doc Checklist, next to the requirement it
-- explains, and shown wherever the student meets that requirement: under its
-- name on the Documents page, opened with "How to prepare this", beside the
-- reason when an upload is sent back, and from the dashboard's to-dos. Staff
-- see the same text on the student's Documents tab.
--
-- A guide has four parts, each optional:
--
--   the short note   document_templates.description, which already existed —
--                    9 of 109 requirements have one (up to 519 characters) —
--                    but was shown only inside the builder, and was wiped by
--                    every edit of its requirement because the edit form had
--                    no field for it. It is now the one line under the name.
--   the full guide   guide_body: plain text with light formatting (numbered
--                    steps, bullets, **bold**, ## headings, [links](https://…))
--                    turned into elements by src/lib/documentGuide.ts — never
--                    stored or rendered as HTML, so a guide cannot put markup
--                    or script into a student's page.
--   a sample         sample_file_path, which also existed and was never used:
--                    a correct example, stored under document-guides/ in the
--                    documents bucket.
--   a video          provider and id, as guide_videos (0135) stores them — the
--                    embed address is composed, never pasted.
--
-- A requirement shared by every destination (the passport, the CV) has one
-- guide, and each country may add a note of its own beneath it
-- (document_guide_country_notes): "Spain: it must carry the Hague Apostille".
--
-- Some requirements are not in the builder at all: a certificate and a
-- transcript per qualification, a scorecard per test, and the travel and
-- refusal papers are derived from the student's profile (derived_key). Their
-- guides live in profile_document_guides, one per kind, seeded empty here.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'document_templates' and column_name = 'sample_file_path'
  ) then
    raise exception '0300: document_templates.sample_file_path is missing';
  end if;
  if exists (select 1 from public.document_templates where char_length(description) > 600) then
    raise exception '0300: a requirement''s description is longer than the 600 characters its note allows';
  end if;
end $$;

-- ------------------------------------------------------------ requirements
alter table public.document_templates
  add column if not exists guide_body text,
  add column if not exists sample_file_name text,
  add column if not exists guide_video_provider text,
  add column if not exists guide_video_id text,
  add column if not exists guide_updated_at timestamptz,
  add column if not exists guide_updated_by uuid references public.staff (id) on delete set null;

alter table public.document_templates drop constraint if exists document_templates_guide_lengths;
alter table public.document_templates add constraint document_templates_guide_lengths check (
  (description is null or char_length(description) <= 600)
  and (guide_body is null or char_length(guide_body) <= 8000)
);
alter table public.document_templates drop constraint if exists document_templates_guide_video;
alter table public.document_templates add constraint document_templates_guide_video check (
  (guide_video_provider is null and guide_video_id is null)
  or (guide_video_provider in ('youtube', 'vimeo') and guide_video_id ~ '^[A-Za-z0-9_-]{1,20}$')
);

comment on column public.document_templates.description is
  'The guide''s short note, shown under the requirement''s name (0300).';
comment on column public.document_templates.guide_body is
  'The full guide, as lightly formatted text — see src/lib/documentGuide.ts (0300).';
comment on column public.document_templates.sample_file_path is
  'A correct example, under document-guides/ in the documents bucket (0300).';

-- ------------------------------------------------ documents from the profile
create table if not exists public.profile_document_guides (
  kind text primary key check (kind in (
    'qualification:certificate', 'qualification:transcript', 'test:scorecard',
    'profile:travel_history', 'profile:visa_refusals'
  )),
  description text check (description is null or char_length(description) <= 600),
  guide_body text check (guide_body is null or char_length(guide_body) <= 8000),
  sample_file_path text,
  sample_file_name text,
  guide_video_provider text,
  guide_video_id text,
  guide_updated_at timestamptz,
  guide_updated_by uuid references public.staff (id) on delete set null,
  check (
    (guide_video_provider is null and guide_video_id is null)
    or (guide_video_provider in ('youtube', 'vimeo') and guide_video_id ~ '^[A-Za-z0-9_-]{1,20}$')
  )
);

insert into public.profile_document_guides (kind) values
  ('qualification:certificate'), ('qualification:transcript'), ('test:scorecard'),
  ('profile:travel_history'), ('profile:visa_refusals')
on conflict (kind) do nothing;

alter table public.profile_document_guides enable row level security;

-- Read by anyone signed in, as the requirements themselves are.
drop policy if exists profile_document_guides_select on public.profile_document_guides;
create policy profile_document_guides_select on public.profile_document_guides
  for select using (auth.role() = 'authenticated');

-- Written by those who write the checklist (document_templates_write, 0137).
-- Update only: the five kinds are fixed, and the app never adds or removes one.
drop policy if exists profile_document_guides_update on public.profile_document_guides;
create policy profile_document_guides_update on public.profile_document_guides
  for update using (has_role(array['super_admin', 'processing']::staff_role[]))
  with check (has_role(array['super_admin', 'processing']::staff_role[]));

-- ------------------------------------------------------------ country notes
create table if not exists public.document_guide_country_notes (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.document_templates (id) on delete cascade,
  profile_kind text references public.profile_document_guides (kind) on delete cascade,
  destination_id uuid not null references public.destinations (id) on delete cascade,
  note text not null check (char_length(note) between 1 and 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff (id) on delete set null,
  check (num_nonnulls(template_id, profile_kind) = 1)
);

create unique index if not exists document_guide_country_notes_template
  on public.document_guide_country_notes (template_id, destination_id) where template_id is not null;
create unique index if not exists document_guide_country_notes_profile
  on public.document_guide_country_notes (profile_kind, destination_id) where profile_kind is not null;

alter table public.document_guide_country_notes enable row level security;

drop policy if exists document_guide_country_notes_select on public.document_guide_country_notes;
create policy document_guide_country_notes_select on public.document_guide_country_notes
  for select using (auth.role() = 'authenticated');

drop policy if exists document_guide_country_notes_write on public.document_guide_country_notes;
create policy document_guide_country_notes_write on public.document_guide_country_notes
  for all using (has_role(array['super_admin', 'processing']::staff_role[]))
  with check (has_role(array['super_admin', 'processing']::staff_role[]));

-- ------------------------------------------------------------- the samples
-- As the scholarship calls (0175): reading a sample is reading the checklist,
-- which anyone signed in may do; writing one is writing the checklist.
drop policy if exists "document_guides_read" on storage.objects;
create policy "document_guides_read" on storage.objects
  for select using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'document-guides'
    and auth.role() = 'authenticated'
  );

drop policy if exists "document_guides_write" on storage.objects;
create policy "document_guides_write" on storage.objects
  for all
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'document-guides'
    and has_role(array['super_admin', 'processing']::staff_role[])
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'document-guides'
    and has_role(array['super_admin', 'processing']::staff_role[])
  );
