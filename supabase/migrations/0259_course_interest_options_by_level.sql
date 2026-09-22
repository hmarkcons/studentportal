-- The course-of-interest picker offers what the student can actually apply to.
--
-- It already limits itself to the countries the student registered for, which
-- also settles public against private: the destinations ARE the two tracks,
-- recorded as "Italy (Public)" and "Italy (Private)", so a student who picked
-- one is never offered the other's universities.
--
-- What it did not do was look at the level. Every subject taught at any level
-- in those countries came back, so a bachelors applicant was offered PhD-only
-- subjects and a PhD applicant was offered subjects no university there
-- teaches beyond bachelors. programs.level has said which is which since 0008;
-- nothing was reading it.
--
-- A student with no level recorded still sees everything. Narrowing to nothing
-- would leave the picker blank with no way to tell that from a country that
-- teaches nothing, and the level is a field somebody can simply not have filled
-- in yet.

create or replace function public.course_interest_options(lead uuid)
returns table (slug text, name text, sort_order integer, specifics text[])
language sql
stable
as $$
  select g.slug,
         g.name,
         g.sort_order,
         array_agg(distinct p.core_field order by p.core_field) as specifics
  from public.leads l
  join public.lead_destinations ld
    on ld.lead_id = l.id
  join public.universities u
    on u.destination_id = ld.destination_id
   and u.status = 'active'
  join public.programs p
    on p.university_id = u.id
   -- The level the student is applying for, when they have one on file.
   and (l.level_applying_for is null
        or btrim(l.level_applying_for) = ''
        or p.level = l.level_applying_for)
  join public.field_groups g
    on g.slug = p.field_group
  where l.id = lead
    and p.core_field is not null
    and btrim(p.core_field) <> ''
  group by g.slug, g.name, g.sort_order
  order by g.sort_order;
$$;

comment on function public.course_interest_options is
  'Field groups, with their distinct core_field values, taught at the student''s own level across the universities of the destinations they are registered for. Public against private comes from the destination itself. A student with no level on file sees every level, rather than an empty picker.';

grant execute on function public.course_interest_options(uuid) to authenticated, service_role;
