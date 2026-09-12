-- Scholarships stop being an Italy-only feature with Italy assumed everywhere.
--
-- Every one of the 21 bodies in the directory is an Italian regional DSU
-- agency, and the code said so in a hard-coded "IT" — the student's
-- Scholarship tab refused to open unless they had an Italy application. There
-- was nowhere to record a scholarship for any other country, and nowhere to
-- say which country a body belongs to.
--
-- Two different things were tangled together in that "IT", and both are now
-- said out loud:
--
--   * which countries a body serves — a body can serve more than one, so it
--     is a join table rather than a column;
--
--   * whether a country's scholarships are something every student gets or
--     something a few students are put forward for. Italy's DSU is a right:
--     every registered student is offered it. France's Eiffel takes thirty
--     master's students in the world. Treating those the same would either
--     promise every French student a scholarship or hide Italy's from the
--     students entitled to it.

-- ------------------------------------------------ which countries a body serves
create table if not exists public.scholarship_body_destinations (
  scholarship_body_id uuid not null references public.scholarship_bodies (id) on delete cascade,
  destination_id uuid not null references public.destinations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (scholarship_body_id, destination_id)
);

comment on table public.scholarship_body_destinations is
  'Which destinations each scholarship body serves. Many-to-many: a body may cover more than one country, and a country has many bodies.';

create index if not exists scholarship_body_destinations_destination_idx
  on public.scholarship_body_destinations (destination_id);

-- Every existing body is Italian. Both Italy rows if the destination exists
-- twice (public and private tracks are separate destinations here), because a
-- body serves the country, not one track of it.
insert into public.scholarship_body_destinations (scholarship_body_id, destination_id)
select b.id, d.id
from public.scholarship_bodies b
cross join public.destinations d
where lower(btrim(d.country)) = 'italy'
on conflict do nothing;

alter table public.scholarship_body_destinations enable row level security;

-- Same reasoning as 0148: the bodies themselves are public agencies published
-- on their own websites, and a student has to be able to read which country
-- their scholarship belongs to. Writes stay with whoever may write the bodies.
drop policy if exists scholarship_body_destinations_select on public.scholarship_body_destinations;
create policy scholarship_body_destinations_select on public.scholarship_body_destinations
  for select using (auth.role() = 'authenticated');

drop policy if exists scholarship_body_destinations_write on public.scholarship_body_destinations;
create policy scholarship_body_destinations_write on public.scholarship_body_destinations
  for all
  using (has_role(array['processing', 'management', 'super_admin']::staff_role[]))
  with check (has_role(array['processing', 'management', 'super_admin']::staff_role[]));

-- --------------------------------------- a right, or something you are put up for
alter table public.destinations
  add column if not exists scholarship_access text not null default 'selective';

alter table public.destinations drop constraint if exists destinations_scholarship_access_check;
alter table public.destinations
  add constraint destinations_scholarship_access_check
  check (scholarship_access in ('universal', 'selective'));

comment on column public.destinations.scholarship_access is
  'universal = every registered student for this country is offered a scholarship (Italy''s DSU). selective = merit-based with a limited quota, opened for one student at a time by staff (France''s Eiffel).';

update public.destinations
set scholarship_access = 'universal'
where lower(btrim(country)) = 'italy';
