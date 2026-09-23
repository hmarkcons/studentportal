-- The same derivation as 0266, for every destination rather than Italy alone.
--
-- 0266 filled levels_offered and fields_offered for Italy's 28 from the
-- programmes underneath them. The remaining 301 universities were left empty
-- only because the question had been asked about Italy. Nothing about the
-- derivation is country-specific, so there is no reason for them to stay that
-- way and no decision to make about them: the answer is already in the rows.
--
-- Everything 0266's comment says still holds, and its two column comments are
-- already in place. In short:
--
--   * These describe THIS CATALOGUE, not the university. Sapienza teaches far
--     more than the eighteen programmes we hold, so fields_offered means
--     "fields we could place a student into".
--   * They go stale — nothing recomputes them when a programme is added. That
--     is free while both columns are write-only outside the import and export.
--     If something starts reading them they want a trigger, like
--     programs.field_group has (0243), not a third run of this.
--
-- Re-deriving Italy's is harmless: the same input gives the same answer.

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
       ), '{}'::text[]);

-- Every university that has programmes must have come out with both filled. A
-- university with none stays empty and is not asked about.
--
-- The fields_offered half of that is the one worth checking: it joins through
-- field_groups, so a programme whose field_group is null, or points at a slug
-- that no longer exists, contributes nothing at all. That is invisible in any
-- row count and would leave a university looking like it teaches less than it
-- does. Italy had none of those; the other 301 had never been looked at.
do $$
declare
  empty_levels text;
  empty_fields text;
  ungrouped int;
begin
  select count(*) into ungrouped
  from public.programs
  where field_group is null or btrim(field_group) = '';

  if ungrouped > 0 then
    -- Not fatal: a programme with no core_field legitimately has no group
    -- (0243 leaves those alone). Worth saying out loud, because each one is a
    -- programme its university will not be credited with here.
    raise notice '0267: % programmes have no field_group and contribute to no university''s fields_offered', ungrouped;
  end if;

  select string_agg(u.name, ', ' order by u.name) into empty_levels
  from public.universities u
  where exists (select 1 from public.programs p where p.university_id = u.id)
    and coalesce(array_length(u.levels_offered, 1), 0) = 0;

  if empty_levels is not null then
    raise exception '0267: these universities have programmes but no levels_offered: %', empty_levels;
  end if;

  select string_agg(u.name, ', ' order by u.name) into empty_fields
  from public.universities u
  where exists (
         select 1 from public.programs p
         where p.university_id = u.id and p.field_group is not null and btrim(p.field_group) <> ''
       )
    and coalesce(array_length(u.fields_offered, 1), 0) = 0;

  if empty_fields is not null then
    raise exception '0267: these universities have grouped programmes but no fields_offered: %', empty_fields;
  end if;
end $$;
