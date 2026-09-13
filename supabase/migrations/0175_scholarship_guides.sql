-- The scholarship guides, and knowing when they have gone stale.
--
-- The directory held a name, a region, a list of universities and a couple of
-- thresholds. What the office actually works from is a guide per body:
-- deadlines, the apply portal, which documents to prepare, whether an affidavit
-- is enough or an apostille is needed, where the CAF offices are, what the ISEE
-- ceiling is. Fourteen of those exist as PDFs and none of it was in the system.
--
-- The sections are not the same from body to body — DSU Toscana's guide has ten
-- and ER.GO's has nine, under different headings — so this is an ordered list
-- of titled sections rather than a fixed set of columns. Staff can rename,
-- reorder, add and delete them; nothing here is a shape the office has to
-- squeeze its own guides into.

alter table public.scholarship_bodies
  add column if not exists guide_sections jsonb not null default '[]'::jsonb,
  add column if not exists apply_url text,
  add column if not exists guide_updated_at timestamptz,
  add column if not exists guide_updated_by uuid references public.staff (id);

comment on column public.scholarship_bodies.guide_sections is
  'Ordered [{title, body}] — the body''s own guide. Headings differ per body, so this is a list rather than columns.';
comment on column public.scholarship_bodies.academic_year is
  'The academic year this guide''s contents describe. Compared against the current year (which rolls in May) to flag a guide that has not been refreshed.';

-- A section with no title is unreadable in a list and a section with no body is
-- an empty heading. A CHECK cannot hold a subquery, so the walk over the array
-- lives in a function the constraint calls.
create or replace function public.scholarship_sections_valid(sections jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(sections) = 'array'
     and not exists (
       select 1
       from jsonb_array_elements(sections) s
       where jsonb_typeof(s) <> 'object'
          or coalesce(btrim(s ->> 'title'), '') = ''
          or coalesce(btrim(s ->> 'body'), '') = ''
     );
$$;

alter table public.scholarship_bodies drop constraint if exists scholarship_bodies_guide_sections_check;
alter table public.scholarship_bodies
  add constraint scholarship_bodies_guide_sections_check
  check (public.scholarship_sections_valid(guide_sections));

-- ------------------------------------------------- is this year's call out yet
-- A body whose call for the new year has not been published cannot be updated,
-- and saying "not updated" of it is wrong — nobody failed to do anything. It
-- gets a date to come back on instead, so the next person knows whether this is
-- work waiting or just the calendar.
alter table public.scholarship_bodies
  add column if not exists call_status text not null default 'published',
  add column if not exists call_expected_on date,
  add column if not exists call_notes text;

alter table public.scholarship_bodies drop constraint if exists scholarship_bodies_call_status_check;
alter table public.scholarship_bodies
  add constraint scholarship_bodies_call_status_check
  check (call_status in ('published', 'awaiting'));

comment on column public.scholarship_bodies.call_status is
  'published = the call for academic_year is out and this guide reflects it. awaiting = not published yet; call_expected_on says when to look again.';

-- Everything already on file describes 2026/2027 and was taken from a published
-- call, which is what the default says.
update public.scholarship_bodies
set call_status = 'published'
where call_status is null;

-- ------------------------------------------------------- the call itself
-- The guide is HMARK's summary of the call. The call is the document that
-- actually governs, and every guide says so in its own footer ("always verify
-- the official call"). Keeping the English PDF against the body means staff and
-- students are checking the same paper, and the source URL means anybody can
-- see where it came from and whether it has moved.
alter table public.scholarship_bodies
  add column if not exists call_pdf_path text,
  add column if not exists call_pdf_url text,
  add column if not exists call_pdf_language text,
  add column if not exists call_pdf_fetched_at timestamptz;

comment on column public.scholarship_bodies.call_pdf_path is
  'Storage path of the official call PDF in the documents bucket. Null when only the link is known.';
comment on column public.scholarship_bodies.call_pdf_url is
  'Where the call was downloaded from, so the source can be rechecked when a new one is published.';
comment on column public.scholarship_bodies.call_pdf_language is
  'en or it — most regions publish the call in Italian only, and a student needs to be told which they are opening.';

-- Reading a call is reading the directory, which any authenticated user may
-- already do (0148). Writing one is writing the body, which is already
-- restricted. Storage is the one place that does not inherit either.
drop policy if exists "scholarship_calls_read" on storage.objects;
create policy "scholarship_calls_read" on storage.objects
  for select using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'scholarship-calls'
    and auth.role() = 'authenticated'
  );

drop policy if exists "scholarship_calls_write" on storage.objects;
create policy "scholarship_calls_write" on storage.objects
  for all
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'scholarship-calls'
    and has_role(array['processing', 'management', 'super_admin']::staff_role[])
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'scholarship-calls'
    and has_role(array['processing', 'management', 'super_admin']::staff_role[])
  );
