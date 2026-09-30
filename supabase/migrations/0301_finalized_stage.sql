-- The step a student reaches when a university is finalized for the visa:
-- Pre-Enrolled in Italy, University Finalized everywhere else.
--
-- Added to both of a destination's pipelines:
--
--   * its country status bar (dashboard_pipeline_stages), right after
--     University & Program — or after Admission where a country has no
--     University & Program (Ireland, Northern Cyprus, Turkey, Luxembourg);
--   * each application's own stages (pipeline_stages), where the university
--     part ends: before the first visa or enrolment stage, or last when there
--     is none. Placed there rather than at the very end so that Hungary's,
--     Sweden's and New Zealand's pipelines, which carry the visa through to
--     enrolled, do not put it after "enrolled".
--
-- Nothing is set by hand: the app sets the step when a university is
-- finalized and takes it off when it is un-finalized (src/lib/finalizedStage.ts,
-- autoStages.ts). Students finalized before this are brought up to date by
-- scripts/backfill-auto-stages.mjs, run after it.
--
-- Also a short name for each university, which is what the step shows under
-- it; left blank, the app shortens the full name itself.
--
-- Safe to run again: each step skips a destination that already has the stage.

alter table public.universities
  add column if not exists short_name text
    check (short_name is null or char_length(btrim(short_name)) between 1 and 32);

comment on column public.universities.short_name is
  'Shown under a finalized student''s Pre-Enrolled / University Finalized step. Null: the app shortens name itself.';

-- ----------------------------------------------------- country status bars
with target as (
  select
    d.id,
    d.dashboard_pipeline_stages as stages,
    case when upper(coalesce(d.country_code, '')) = 'IT'
      then '{"key":"pre_enrolled","label":"Pre-Enrolled","type":"checkbox","options":["Pre-Enrolled"]}'::jsonb
      else '{"key":"university_finalized","label":"University Finalized","type":"checkbox","options":["Finalized"]}'::jsonb
    end as stage
  from public.destinations d
  where jsonb_typeof(d.dashboard_pipeline_stages) = 'array'
    and jsonb_array_length(d.dashboard_pipeline_stages) > 0
    and not exists (
      select 1 from jsonb_array_elements(d.dashboard_pipeline_stages) e
      where e->>'key' in ('pre_enrolled', 'university_finalized')
    )
),
placed as (
  select
    t.*,
    coalesce(
      (select max(e.ord) from jsonb_array_elements(t.stages) with ordinality e(v, ord) where e.v->>'key' = 'university_and_program'),
      (select max(e.ord) from jsonb_array_elements(t.stages) with ordinality e(v, ord) where e.v->>'key' = 'admission'),
      jsonb_array_length(t.stages)
    ) as after_ord
  from target t
)
update public.destinations d
set dashboard_pipeline_stages = (
  select jsonb_agg(x.v order by x.o)
  from (
    select e.v, e.ord::numeric as o from jsonb_array_elements(p.stages) with ordinality e(v, ord)
    union all
    select p.stage, p.after_ord + 0.5
  ) x
)
from placed p
where d.id = p.id;

-- ------------------------------------------------- application pipelines
with target as (
  select
    d.id,
    d.pipeline_stages as stages,
    case when upper(coalesce(d.country_code, '')) = 'IT' then 'pre_enrolled' else 'university_finalized' end as stage
  from public.destinations d
  where jsonb_typeof(d.pipeline_stages) = 'array'
    and jsonb_array_length(d.pipeline_stages) > 0
    and not (d.pipeline_stages ? 'pre_enrolled' or d.pipeline_stages ? 'university_finalized')
),
placed as (
  select
    t.*,
    coalesce(
      (select min(e.ord) - 1 from jsonb_array_elements_text(t.stages) with ordinality e(v, ord) where e.v ~ '^(visa_|enrol)'),
      jsonb_array_length(t.stages)
    ) as after_ord
  from target t
)
update public.destinations d
set pipeline_stages = (
  select jsonb_agg(x.v order by x.o)
  from (
    select to_jsonb(e.v) as v, e.ord::numeric as o from jsonb_array_elements_text(p.stages) with ordinality e(v, ord)
    union all
    select to_jsonb(p.stage), p.after_ord + 0.5
  ) x
)
from placed p
where d.id = p.id;

-- Every destination with stages now has the step in both, exactly once.
do $$
declare
  v_missing int;
  v_twice int;
begin
  select count(*) into v_missing
  from public.destinations d
  where (jsonb_array_length(d.dashboard_pipeline_stages) > 0
         and not exists (select 1 from jsonb_array_elements(d.dashboard_pipeline_stages) e where e->>'key' in ('pre_enrolled', 'university_finalized')))
     or (jsonb_array_length(d.pipeline_stages) > 0
         and not (d.pipeline_stages ? 'pre_enrolled' or d.pipeline_stages ? 'university_finalized'));
  if v_missing > 0 then
    raise exception '% destinations are still without the finalized stage', v_missing;
  end if;

  select count(*) into v_twice
  from public.destinations d
  where (select count(*) from jsonb_array_elements(d.dashboard_pipeline_stages) e where e->>'key' in ('pre_enrolled', 'university_finalized')) > 1
     or (select count(*) from jsonb_array_elements_text(d.pipeline_stages) e where e in ('pre_enrolled', 'university_finalized')) > 1;
  if v_twice > 0 then
    raise exception '% destinations have the finalized stage twice', v_twice;
  end if;
end $$;
