-- Travel & Arrival: what to take, and what to do once you land.
--
-- Shown to a student only once their visa is issued. A refused student must
-- never open a page about packing for a country they are not going to, which is
-- why this is gated on the same outcome the Visa tab reads rather than on
-- having an application.
--
-- Tickable, so it is three tables rather than a blob of JSON: an item a student
-- can mark done needs an identity that survives the office re-wording it.
-- Sections and items are separate so renaming "Before you fly" does not touch
-- the fifteen rows underneath it.

create table if not exists public.travel_guide_sections (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations (id) on delete cascade,
  title text not null,
  intro text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.travel_guide_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.travel_guide_sections (id) on delete cascade,
  label text not null,
  detail text,
  -- A deadline that starts counting from the day they arrive, not a date:
  -- "within 8 days of arriving" is how every one of these rules is written.
  days_after_arrival integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists travel_guide_sections_dest_idx
  on public.travel_guide_sections (destination_id, sort_order);
create index if not exists travel_guide_items_section_idx
  on public.travel_guide_items (section_id, sort_order);

-- What the student has done. Keyed by item, so re-wording an item keeps the
-- tick and deleting one takes it with it.
create table if not exists public.student_travel_checks (
  student_id uuid not null references public.leads (id) on delete cascade,
  item_id uuid not null references public.travel_guide_items (id) on delete cascade,
  checked_at timestamptz not null default now(),
  primary key (student_id, item_id)
);

alter table public.travel_guide_sections enable row level security;
alter table public.travel_guide_items enable row level security;
alter table public.student_travel_checks enable row level security;

-- The guide is readable by any signed-in user. It has to reach students, and
-- which documents Italy asks for on arrival is not a secret; whether a
-- particular student sees the tab is decided by their visa outcome in the page,
-- not by hiding the text.
drop policy if exists travel_guide_sections_select on public.travel_guide_sections;
create policy travel_guide_sections_select on public.travel_guide_sections
  for select using (auth.role() = 'authenticated');

drop policy if exists travel_guide_items_select on public.travel_guide_items;
create policy travel_guide_items_select on public.travel_guide_items
  for select using (auth.role() = 'authenticated');

drop policy if exists travel_guide_sections_write on public.travel_guide_sections;
create policy travel_guide_sections_write on public.travel_guide_sections
  for all
  using (has_role(array['processing', 'management', 'super_admin']::staff_role[]))
  with check (has_role(array['processing', 'management', 'super_admin']::staff_role[]));

drop policy if exists travel_guide_items_write on public.travel_guide_items;
create policy travel_guide_items_write on public.travel_guide_items
  for all
  using (has_role(array['processing', 'management', 'super_admin']::staff_role[]))
  with check (has_role(array['processing', 'management', 'super_admin']::staff_role[]));

-- A student ticks their own; staff who can see them can read it, so the office
-- can tell who still has not registered their residence.
drop policy if exists student_travel_checks_select on public.student_travel_checks;
create policy student_travel_checks_select on public.student_travel_checks
  for select using (is_own_student(student_id) or staff_can_view_student(student_id));

drop policy if exists student_travel_checks_write on public.student_travel_checks;
create policy student_travel_checks_write on public.student_travel_checks
  for all
  using (is_own_student(student_id) or staff_can_view_student(student_id))
  with check (is_own_student(student_id) or staff_can_view_student(student_id));

insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
values (
  'settings.travel_guide',
  'Setup',
  'Edit the travel & arrival guides',
  'Write what a student should take with them and do on arrival, per country. Shown to a student only once their visa is issued.',
  '{processing,management,super_admin}',
  (select coalesce(max(sort_order), 0) + 10 from public.permission_definitions)
)
on conflict (key) do update
  set category = excluded.category,
      label = excluded.label,
      description = excluded.description;

-- ------------------------------------------------------------- Italy
-- A starting point, not the final word. These are the well-established steps
-- every Pakistani student going to Italy has to take; the office must read
-- them and correct anything its own experience contradicts before a student
-- relies on it.
do $$
declare
  v_dest uuid;
  v_section uuid;
begin
  for v_dest in select id from public.destinations where lower(btrim(country)) = 'italy' loop
    -- Only if nobody has written one, so re-running this cannot overwrite the
    -- office's own wording.
    if exists (select 1 from public.travel_guide_sections where destination_id = v_dest) then
      continue;
    end if;

    insert into public.travel_guide_sections (destination_id, title, intro, sort_order)
    values (v_dest, 'Carry in your hand luggage', 'Not in your checked bag. You will be asked for these at the border, and a suitcase that arrives a day late is still a suitcase you cannot show anyone.', 10)
    returning id into v_section;
    insert into public.travel_guide_items (section_id, label, detail, sort_order) values
      (v_section, 'Passport with the visa sticker', 'Check the dates on the sticker before you fly.', 10),
      (v_section, 'University admission / enrolment letter', 'The original, plus a photocopy.', 20),
      (v_section, 'Pre-enrolment confirmation (Universitaly)', null, 30),
      (v_section, 'Proof of accommodation in Italy', 'Contract, university housing letter, or your host''s declaration.', 40),
      (v_section, 'Health insurance policy', 'Valid from the day you arrive.', 50),
      (v_section, 'Proof of financial means', 'The same documents the visa was granted on.', 60),
      (v_section, 'Academic documents, legalised and translated', 'Degree, transcripts, and the declaration of value if you have it.', 70),
      (v_section, 'Passport photographs', 'Six, in the European format. You will need them repeatedly.', 80),
      (v_section, 'Flight ticket and travel insurance', null, 90);

    insert into public.travel_guide_sections (destination_id, title, intro, sort_order)
    values (v_dest, 'Before you leave Pakistan', null, 20)
    returning id into v_section;
    insert into public.travel_guide_items (section_id, label, detail, sort_order) values
      (v_section, 'Scan everything and email it to yourself', 'Passport, visa, letters, insurance. A lost folder stops being a crisis.', 10),
      (v_section, 'Tell your counsellor your flight details', 'So the office knows when you land and can help if something goes wrong.', 20),
      (v_section, 'Carry some euros in cash', 'Enough for a few days. Your card may not work on the first attempt abroad.', 30),
      (v_section, 'Check your airline''s baggage rules', null, 40);

    insert into public.travel_guide_sections (destination_id, title, intro, sort_order)
    values (v_dest, 'In your first week in Italy', 'These have deadlines. Starting them late is the most common problem students hit.', 30)
    returning id into v_section;
    insert into public.travel_guide_items (section_id, label, detail, days_after_arrival, sort_order) values
      (v_section, 'Apply for your permesso di soggiorno', 'The residence permit. Submit the kit at a Poste Italiane Sportello Amico within eight days of arriving — this one is not flexible.', 8, 10),
      (v_section, 'Get your codice fiscale', 'Your tax code, from the Agenzia delle Entrate. Almost nothing else can be done without it.', 14, 20),
      (v_section, 'Register at your university', 'Complete enrolment in person and collect your student number.', 14, 30),
      (v_section, 'Open an Italian bank account', 'You will need your codice fiscale and your permesso receipt.', 30, 40),
      (v_section, 'Register with the health service (SSN or insurance)', null, 30, 50),
      (v_section, 'Get a local SIM', 'Needed for appointments, bank verification and the university portal.', 7, 60);

    insert into public.travel_guide_sections (destination_id, title, intro, sort_order)
    values (v_dest, 'Settling in', null, 40)
    returning id into v_section;
    insert into public.travel_guide_items (section_id, label, detail, sort_order) values
      (v_section, 'Apply for your DSU scholarship if you have not already', 'Check the deadline for your region — it is usually early in the academic year.', 10),
      (v_section, 'Apply for university accommodation or a student card', null, 20),
      (v_section, 'Keep every receipt and protocol number', 'Italian offices ask for them again later.', 30),
      (v_section, 'Tell your counsellor once you are enrolled', 'It closes your file properly, and we like knowing you arrived.', 40);
  end loop;
end;
$$;
