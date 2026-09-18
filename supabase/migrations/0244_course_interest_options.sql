-- The options a student's course-of-interest picker offers, and a backfill of
-- what existing students already have.
--
-- The picker is two-level: broad field, then optionally the specific
-- core_fields within it, limited to what the student's own countries actually
-- teach. Getting that through PostgREST means lead_destinations ->
-- universities -> programs -> field_groups, and pulling the programme rows to
-- reduce them in the app: Germany alone has 421, so a student with three
-- countries would fetch around a thousand rows to derive a few dozen labels.
--
-- One function instead, returning exactly the labels. Deliberately NOT
-- security definer: it reads lead_destinations, and row-level security should
-- decide whether this caller may see that student at all.

create or replace function public.course_interest_options(lead uuid)
returns table (slug text, name text, sort_order integer, specifics text[])
language sql
stable
as $$
  select g.slug,
         g.name,
         g.sort_order,
         array_agg(distinct p.core_field order by p.core_field) as specifics
  from public.lead_destinations ld
  join public.universities u
    on u.destination_id = ld.destination_id
   and u.status = 'active'
  join public.programs p
    on p.university_id = u.id
  join public.field_groups g
    on g.slug = p.field_group
  where ld.lead_id = lead
    and p.core_field is not null
    and btrim(p.core_field) <> ''
  group by g.slug, g.name, g.sort_order
  order by g.sort_order;
$$;

comment on function public.course_interest_options is
  'Field groups, with their distinct core_field values, available across the universities of the destinations a student is registered for. Both levels of the course-of-interest picker in one call.';

grant execute on function public.course_interest_options(uuid) to authenticated, service_role;

-- --------------------------------------------------------------- backfill
--
-- Existing students carry course_of_interest as free text — "Computer
-- Science", typed into a box. Where that text IS a real field, they get the
-- structured selection for free and the picker opens with their interest
-- already ticked rather than blank.
--
-- Exact, case-insensitive matches only. A student whose text is close to
-- something is left alone: nothing is lost, because the text is still there
-- and still displayed, and guessing at a near-match would put a field on
-- someone's record that they never chose.

-- 1. Text that exactly matches a specific core_field taught in one of the
--    student's countries. The group comes along, since the specific belongs
--    to it and the picker needs the parent ticked to show the child.
with matched as (
  select distinct on (l.id)
         l.id as lead_id,
         p.core_field,
         p.field_group
  from public.leads l
  join public.lead_destinations ld on ld.lead_id = l.id
  join public.universities u on u.destination_id = ld.destination_id
  join public.programs p on p.university_id = u.id
  where l.registered_at is not null
    and coalesce(array_length(l.interest_core_fields, 1), 0) = 0
    and coalesce(array_length(l.interest_field_groups, 1), 0) = 0
    and btrim(coalesce(l.course_of_interest, '')) <> ''
    and lower(btrim(p.core_field)) = lower(btrim(l.course_of_interest))
    and p.field_group is not null
  order by l.id, p.core_field
)
update public.leads l
   set interest_core_fields = array[m.core_field],
       interest_field_groups = array[m.field_group]
  from matched m
 where l.id = m.lead_id;

-- 2. Text that matches a broad field's name instead ("Engineering",
--    "Law"). Only the group is set; no specific is invented.
with matched as (
  select l.id as lead_id, g.slug
  from public.leads l
  join public.field_groups g on lower(g.name) = lower(btrim(l.course_of_interest))
  where l.registered_at is not null
    and coalesce(array_length(l.interest_core_fields, 1), 0) = 0
    and coalesce(array_length(l.interest_field_groups, 1), 0) = 0
    and btrim(coalesce(l.course_of_interest, '')) <> ''
)
update public.leads l
   set interest_field_groups = array[m.slug]
  from matched m
 where l.id = m.lead_id;
