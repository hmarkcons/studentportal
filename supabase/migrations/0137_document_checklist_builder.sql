-- Foundation for the Create Doc Checklist builder (Setup menu).
--
-- Three things were missing to make a per-country checklist editable:
--
-- 1. Sections did not exist as data. They were the CATEGORY_ORDER constant in
--    src/lib/documentCategories.ts, so a new section meant a code change and
--    "remove this section from Italy" could not be expressed at all. They are
--    now rows: document_sections is the palette (the frozen, pre-determined
--    set to drag from) and destination_document_sections says which sections a
--    given destination's checklist has, and in what order.
--
-- 2. Most items live on destination_id = NULL, shared by every country. That
--    stays — "All destinations" is an entry in the builder like any country,
--    so editing a shared item there reaches everywhere. But a country also has
--    to be able to drop an inherited item it genuinely does not need, and that
--    cannot be done by deleting a shared row. destination_document_exclusions
--    records "this country does not ask for that shared item".
--
-- 3. Some requirements are derived from the student's own profile rather than
--    from a template — a row per qualification and per test score they have
--    entered. derived_key gives those rows a stable identity so re-seeding is
--    idempotent and so the row for a deleted qualification can be found again.
--
-- Also tightens who may edit the catalogue: document_templates_write was
-- is_active_staff(), meaning a counselor or a marketing user could rewrite
-- every country's document checklist. The brief puts this with Super Admin and
-- Processing, which is also who the student-facing review actions belong to.

-- ---------------------------------------------------------------- sections
create table if not exists public.document_sections (
  key text primary key,
  label text not null,
  -- Pre-determined sections ship with the product and are the palette the
  -- builder drags from; they cannot be renamed away or deleted, only left out
  -- of a destination's checklist.
  is_predefined boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.document_sections (key, label, is_predefined, sort_order) values
  ('admission',             'Admission Documents',          true,  10),
  ('interview',             'Interview',                    true,  20),
  ('attestation',           'Attestation',                  true,  30),
  ('visa',                  'Visa Application Requirements',true,  40),
  ('scholarship_documents', 'Scholarship Documents',        true,  50),
  ('italian_translations',  'Italian Translations',         true,  60),
  ('visa_sticker',          'Visa Sticker',                 true,  70),
  ('travel',                'Travel',                       true,  80),
  ('enrollment',            'Enrollment',                   true,  90),
  ('scholarship',           'Scholarship',                  true, 100),
  ('other',                 'Other',                        true, 110)
on conflict (key) do update set label = excluded.label, is_predefined = true;

-- ------------------------------------------- which sections each destination has
create table if not exists public.destination_document_sections (
  id uuid primary key default gen_random_uuid(),
  -- NULL means the "All destinations" checklist, matching document_templates.
  destination_id uuid references public.destinations (id) on delete cascade,
  section_key text not null references public.document_sections (key) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- NULLS NOT DISTINCT so the All-destinations rows cannot be duplicated: a
-- plain unique constraint treats every NULL destination_id as different.
create unique index if not exists destination_document_sections_unique
  on public.destination_document_sections (destination_id, section_key) nulls not distinct;

-- Seed each destination with the sections it already has items for, keeping
-- the palette's order, so no existing checklist changes shape on deploy.
insert into public.destination_document_sections (destination_id, section_key, sort_order)
select distinct t.destination_id, t.category, coalesce(s.sort_order, 999)
from public.document_templates t
join public.document_sections s on s.key = t.category
on conflict do nothing;

-- Every destination that has its own items also inherits the shared ones, so
-- the sections those shared items live in must be present too.
insert into public.destination_document_sections (destination_id, section_key, sort_order)
select d.id, shared.category, coalesce(s.sort_order, 999)
from public.destinations d
cross join (select distinct category from public.document_templates where destination_id is null) shared
join public.document_sections s on s.key = shared.category
on conflict do nothing;

-- ------------------------------------------------------------- exclusions
create table if not exists public.destination_document_exclusions (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations (id) on delete cascade,
  template_id uuid not null references public.document_templates (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (destination_id, template_id)
);

-- ------------------------------------------------- profile-derived requirements
alter table public.student_documents
  add column if not exists derived_key text;

-- One row per derived requirement per student, so ensureStudentDocumentRequirements
-- can be run on every page load without duplicating anything.
create unique index if not exists student_documents_derived_key_unique
  on public.student_documents (student_id, derived_key)
  where derived_key is not null;

-- ------------------------------------------------------------------- RLS
alter table public.document_sections enable row level security;
alter table public.destination_document_sections enable row level security;
alter table public.destination_document_exclusions enable row level security;

-- Students need to read section labels to see their own checklist grouped, so
-- reads are open to any authenticated user, matching document_templates.
drop policy if exists document_sections_select on public.document_sections;
create policy document_sections_select on public.document_sections
  for select using (auth.role() = 'authenticated');

drop policy if exists destination_document_sections_select on public.destination_document_sections;
create policy destination_document_sections_select on public.destination_document_sections
  for select using (auth.role() = 'authenticated');

drop policy if exists destination_document_exclusions_select on public.destination_document_exclusions;
create policy destination_document_exclusions_select on public.destination_document_exclusions
  for select using (auth.role() = 'authenticated');

drop policy if exists document_sections_write on public.document_sections;
create policy document_sections_write on public.document_sections
  for all using (has_role(array['super_admin', 'processing']::staff_role[]))
  with check (has_role(array['super_admin', 'processing']::staff_role[]));

drop policy if exists destination_document_sections_write on public.destination_document_sections;
create policy destination_document_sections_write on public.destination_document_sections
  for all using (has_role(array['super_admin', 'processing']::staff_role[]))
  with check (has_role(array['super_admin', 'processing']::staff_role[]));

drop policy if exists destination_document_exclusions_write on public.destination_document_exclusions;
create policy destination_document_exclusions_write on public.destination_document_exclusions
  for all using (has_role(array['super_admin', 'processing']::staff_role[]))
  with check (has_role(array['super_admin', 'processing']::staff_role[]));

-- The checklist catalogue itself: was any active staff member.
drop policy if exists document_templates_write on public.document_templates;
create policy document_templates_write on public.document_templates
  for all using (has_role(array['super_admin', 'processing']::staff_role[]))
  with check (has_role(array['super_admin', 'processing']::staff_role[]));
