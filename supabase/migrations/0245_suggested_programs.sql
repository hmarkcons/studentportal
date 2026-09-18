-- Programmes to suggest to a student, from their course of interest.
--
-- The student's interests are now structured (0243): broad field groups and,
-- optionally, specific core_fields. That is enough to answer the question the
-- Applications tab should be answering — "which programmes, at the
-- universities of the countries this student is registered for, match what
-- they said they want?" — instead of leaving staff to work down a
-- country-by-country list by hand.
--
-- As a function because the answer is a five-table join with array
-- containment and an exclusion, and pulling the parts back to combine them in
-- the app would mean fetching most of the catalogue: Germany alone has 421
-- programmes.
--
-- NOT security definer. It reads lead_destinations and applications; RLS
-- should decide whether this caller may see this student at all.

create or replace function public.suggested_programs(lead uuid, max_results integer default 25)
returns table (
  program_id uuid,
  program_name text,
  level text,
  core_field text,
  field_group text,
  field_group_name text,
  university_id uuid,
  university_name text,
  destination_name text,
  is_backup boolean,
  matched_specific boolean
)
language sql
stable
as $$
  with me as (
    select level_applying_for,
           coalesce(interest_field_groups, '{}') as groups,
           coalesce(interest_core_fields, '{}') as specifics
    from public.leads
    where id = lead
  )
  select p.id,
         p.name,
         p.level,
         p.core_field,
         p.field_group,
         g.name,
         u.id,
         u.name,
         d.display_name,
         ld.is_backup,
         p.core_field = any(me.specifics) as matched_specific
  from me
  join public.lead_destinations ld on ld.lead_id = lead
  join public.destinations d on d.id = ld.destination_id
  join public.universities u
    on u.destination_id = d.id
   and u.status = 'active'
  join public.programs p on p.university_id = u.id
  join public.field_groups g on g.slug = p.field_group
  where
    -- A specific field the student named, or anything in a broad field they
    -- chose. Choosing only broad fields is normal and must still suggest.
    (p.core_field = any(me.specifics) or p.field_group = any(me.groups))
    -- The level they are applying for, when that is known. A master's
    -- candidate has no use for bachelor's programmes.
    and (me.level_applying_for is null or p.level = me.level_applying_for)
    -- Never suggest what they have already applied for, in any intake: the
    -- unique index would refuse it for this cycle anyway, and an earlier
    -- attempt is not a suggestion either.
    and not exists (
      select 1 from public.applications a
      where a.student_id = lead and a.program_id = p.id
    )
  order by
    -- A field the student named specifically beats one that merely sits in a
    -- broad field they ticked.
    (p.core_field = any(me.specifics)) desc,
    -- Their primary country before their backups.
    ld.is_backup,
    u.name,
    p.name
  limit greatest(max_results, 1);
$$;

comment on function public.suggested_programs is
  'Programmes matching a student''s course of interest, at universities in the countries they are registered for, excluding anything already applied for. Specific-field matches and primary-country results first.';

grant execute on function public.suggested_programs(uuid, integer) to authenticated, service_role;
