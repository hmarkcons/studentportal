-- What each Italian university teaches, derived from the programmes we hold.
--
-- levels_offered and fields_offered were empty on all 329 universities in the
-- system, not just Italy's. They are columns of the catalogue sheet, so every
-- export carried them blank and somebody would have filled them in by reading
-- the programme list underneath — which is exactly what this does, in SQL, so
-- it cannot be read wrong.
--
-- Computed rather than typed. Unlike the cities and the regions, no outside
-- knowledge is involved: the answer is already in the programmes, and writing
-- it as a derivation means the rule is the code rather than a list somebody
-- has to trust.
--
-- ----------------------------------------------------- what these mean
--
-- They describe THIS CATALOGUE, not the university. Sapienza teaches a great
-- deal more than the eighteen programmes we hold for it, so "fields_offered"
-- is really "fields we have programmes for and could place a student into".
-- That is the useful reading for staff and the honest one; the column comments
-- below say so, because the names invite the other interpretation.
--
-- They also go stale. Add a programme in a new field and this does not move.
-- Nothing reads either column today — outside the import and export plumbing
-- they are write-only — so staleness costs nothing yet. The moment something
-- does read them, they want the trigger treatment programs.field_group already
-- has (0243), not a second run of this.
--
-- ------------------------------------------------------------- the vocabulary
--
-- fields_offered takes field_groups.name — "Computer Science & IT",
-- "Engineering — Mechanical & Automotive" — in field_groups.sort_order.
--
-- That is the vocabulary the course-of-interest picker already runs on (0243,
-- 0259), which is the only other place in the system that answers "what subject
-- is this". The alternative was the five coarse buckets named in a comment in
-- 0008 (Engineering, IT/CS, Health Sciences, Social Sciences, Media Sciences),
-- which exist nowhere in any row and would need thirty-five groups collapsed
-- into five by guesswork.
--
-- Averages 8 groups per university and runs to 343 characters at the longest,
-- which is a wide cell in a spreadsheet and still a readable one.

comment on column public.universities.levels_offered is
  'Levels this university has programmes at IN THIS CATALOGUE, derived from programs.level. Not a claim about everything the university teaches — only what we hold and could place a student into. Not maintained: it goes stale when programmes are added.';

comment on column public.universities.fields_offered is
  'field_groups.name for every group this university''s catalogued programmes fall into, in field_groups.sort_order. Derived from programs.field_group, which a trigger fills from core_field (0243). Same caveat as levels_offered: it describes our catalogue, not the university.';

update public.universities u
   set levels_offered = coalesce((
         select array_agg(lvl.level order by lvl.rank)
         from (
           select distinct p.level,
                  case p.level when 'bachelors' then 1 when 'masters' then 2 when 'phd' then 3 else 4 end as rank
           from public.programs p
           where p.university_id = u.id
         ) lvl
       ), '{}'::text[]),
       fields_offered = coalesce((
         select array_agg(grp.name order by grp.sort_order, grp.name)
         from (
           select distinct g.name, g.sort_order
           from public.programs p
           join public.field_groups g on g.slug = p.field_group
           where p.university_id = u.id
         ) grp
       ), '{}'::text[])
 where u.destination_id = (select id from public.destinations where display_name = 'Italy (Public)');

-- A university with programmes must have come out with both filled. One with
-- none legitimately stays empty — Università degli Studi di Genova is in the
-- catalogue with nothing under it — so the check asks only about the ones that
-- have something to derive from.
--
-- This is not busywork: the fields_offered subquery joins through
-- field_groups, and a programme whose field_group is null or points at a slug
-- that no longer exists simply contributes nothing. That is invisible in the
-- row count and would leave a university looking like it teaches less than it
-- does.
do $$
declare
  empty_levels text;
  empty_fields text;
begin
  select string_agg(u.name, ', ' order by u.name) into empty_levels
  from public.universities u
  join public.destinations d on d.id = u.destination_id
  where d.display_name = 'Italy (Public)'
    and exists (select 1 from public.programs p where p.university_id = u.id)
    and coalesce(array_length(u.levels_offered, 1), 0) = 0;

  if empty_levels is not null then
    raise exception '0266: these Italy universities have programmes but no levels_offered: %', empty_levels;
  end if;

  select string_agg(u.name, ', ' order by u.name) into empty_fields
  from public.universities u
  join public.destinations d on d.id = u.destination_id
  where d.display_name = 'Italy (Public)'
    and exists (select 1 from public.programs p where p.university_id = u.id)
    and coalesce(array_length(u.fields_offered, 1), 0) = 0;

  if empty_fields is not null then
    raise exception '0266: these Italy universities have programmes but no fields_offered: %', empty_fields;
  end if;
end $$;
