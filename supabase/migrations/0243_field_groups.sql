-- A field taxonomy over programmes.core_field, and a student's interests.
--
-- core_field is per-programme free text: 1,297 distinct values across 2,286
-- programmes, so almost one per programme. Italy alone has 279 for 341
-- programmes, including "Astrophysics, cosmology and space physics (degree
-- class LM-58)" and "Applied Linguistics / International Business
-- Communication (LM-38-R)". It describes a programme well and groups nothing.
--
-- That is fine for a catalogue and useless as a picker, which is the problem
-- this solves: staff choose a BROAD field, then optionally the specific
-- core_field within it. The broad level needs a mapping from those 1,297
-- values, and the mapping is stored on the programme rather than recomputed on
-- every page load — it is queried per student per destination, and a saved
-- student interest must not drift if the rules are ever refined.
--
-- The classifier is a function plus a trigger, not a one-off backfill, so
-- every programme added from here on is grouped on the way in. Ireland,
-- Romania and Sweden still have no programmes; they will arrive classified.

-- ------------------------------------------------------------ the taxonomy
create table if not exists public.field_groups (
  slug text primary key,
  name text not null,
  sort_order integer not null default 0
);

comment on table public.field_groups is
  'Broad study fields, used as the first level of a student''s course of interest and as the grouping over programmes.core_field.';

insert into public.field_groups (slug, name, sort_order) values
  -- Health, kept granular on purpose: "Medicine" and "Pharmacy" are different
  -- decisions for a student and different products for the agency. Romania and
  -- Hungary are sold on English-taught medicine specifically.
  ('medicine',            'Medicine',                              10),
  ('dentistry',           'Dentistry',                             20),
  ('pharmacy',            'Pharmacy',                              30),
  ('veterinary',          'Veterinary Medicine',                   40),
  ('nursing_allied',      'Nursing & Allied Health',               50),
  ('public_health',       'Public Health & Health Management',      60),
  -- Sciences
  ('life_sciences',       'Life Sciences & Biotechnology',          70),
  ('chemistry',           'Chemistry',                              80),
  ('physics',             'Physics & Astronomy',                    90),
  ('mathematics',         'Mathematics & Statistics',              100),
  ('earth_environment',   'Earth & Environmental Sciences',        110),
  -- Computing
  ('computer_science',    'Computer Science & IT',                 120),
  ('data_ai',             'Data Science & Artificial Intelligence', 130),
  -- Engineering, split where the split is what a student actually says
  ('eng_mechanical',      'Engineering — Mechanical & Automotive',  140),
  ('eng_electrical',      'Engineering — Electrical & Electronics', 150),
  ('eng_civil',           'Engineering — Civil & Construction',     160),
  ('eng_chemical',        'Engineering — Chemical & Materials',     170),
  ('eng_aerospace',       'Engineering — Aerospace',                180),
  ('eng_industrial',      'Engineering — Industrial & Logistics',   190),
  ('eng_other',           'Engineering — Other',                    200),
  ('architecture',        'Architecture & Design',                  210),
  -- Business and society
  ('business',            'Business & Management',                  220),
  ('economics_finance',   'Economics, Finance & Accounting',        230),
  ('law',                 'Law',                                   240),
  ('social_sciences',     'Social Sciences & Politics',            250),
  ('psychology',          'Psychology',                            260),
  ('education',           'Education',                             270),
  ('humanities',          'Humanities & Languages',                280),
  ('arts_media',          'Arts, Media & Communication',           290),
  ('music_performing',    'Music & Performing Arts',               300),
  ('agriculture_food',    'Agriculture & Food Sciences',           310),
  ('tourism_hospitality', 'Tourism & Hospitality',                 320),
  ('sport',               'Sport Sciences',                        330),
  ('natural_sciences',    'Natural Sciences (general)',            340),
  -- Everything the rules cannot place. A real group rather than a null,
  -- because the picker builds its specific list from the group: a programme
  -- with no group would be unreachable, and a student could not choose it at
  -- all. Sorted last, and named so nobody mistakes it for a discipline.
  ('other',               'Other / Not categorised',               990)
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;

grant select on public.field_groups to authenticated, anon, service_role;
alter table public.field_groups enable row level security;
-- A fixed reference list with nothing private in it; readable by anyone signed
-- in, writable only through a migration.
create policy "field_groups_select" on public.field_groups for select using (true);

-- --------------------------------------------------------- the classifier
--
-- Ordered most specific first. Order is the whole correctness of this
-- function: "Biomedical Engineering" must reach the engineering branch before
-- the "biomed" life-sciences branch, "Dental Medicine" before "Medicine", and
-- "Agricultural Engineering" before the generic engineering catch-all.
--
-- Deliberately returns null rather than guessing when nothing matches. A wrong
-- group is worse than an ungrouped programme: the programme still appears in
-- the specific list for its country, so nothing becomes unreachable, and the
-- count of unclassified rows is a number worth being able to look at.
create or replace function public.classify_core_field(raw text)
returns text
language sql
immutable
as $$
  with t as (select lower(coalesce(raw, '')) as s)
  select case
    -- ---------------------------------------------------------------- health
    when s ~ 'dental|dentist|odonto'                                     then 'dentistry'
    when s ~ 'pharmac|pharmaz'                                           then 'pharmacy'
    when s ~ 'veterinar'                                                 then 'veterinary'
    when s ~ 'nursing|nurse|midwif|physiotherap|occupational therap|radiograph|optometr|dietet|nutrition|speech therap|paramedic'
                                                                         then 'nursing_allied'
    when s ~ 'public health|health management|health care management|health economic|epidemiolog|health tourism|health promotion'
                                                                         then 'public_health'
    -- Engineering that mentions a life-science word must not fall to biology.
    when s ~ '(biomedical|biochemical|bioprocess|biosystems|tissue|genetic).*(engineer)'
                                                                         then 'eng_chemical'
    when s ~ 'medicine|medical|surgery|physician|clinical|anatom|patholog|immunolog|neurosci|psychiatr|radiolog|cardio'
                                                                         then 'medicine'
    -- ------------------------------------------------------------- computing
    when s ~ 'artificial intelligence|machine learning|data scien|big data|data analyt|business analytic'
                                                                         then 'data_ai'
    when s ~ 'computer|informatic|software|cyber|information technolog|computing|network|game develop|web develop'
                                                                         then 'computer_science'
    -- ----------------------------------------------------------- engineering
    when s ~ 'aerospace|aeronaut|aviation|astronaut|space engineer|pilot'  then 'eng_aerospace'
    when s ~ 'mechanical|automotive|mechatron|vehicle|motorsport|manufactur|robotic|marine engineer|naval'
                                                                         then 'eng_mechanical'
    when s ~ 'electric|electron|power engineer|telecommunic|control engineer|automation'
                                                                         then 'eng_electrical'
    when s ~ 'civil|structural|construction|geodes|surveying|infrastructur|transport engineer|railway'
                                                                         then 'eng_civil'
    when s ~ 'chemical engineer|materials|metallurg|polymer|petroleum|mining|process engineer'
                                                                         then 'eng_chemical'
    when s ~ 'industrial engineer|logistic|supply chain|engineering management|engineering manager|systems engineer|quality engineer'
                                                                         then 'eng_industrial'
    -- -------------------------------------------------------- architecture
    when s ~ 'architect|urban|landscape|interior design|built environment|spatial plan'
                                                                         then 'architecture'
    -- --------------------------------------------------------- agriculture
    -- BEFORE the generic engineering catch-all, deliberately. "Agricultural
    -- Engineering" and "Food Engineering" are what a student interested in
    -- agriculture goes looking for; leaving them to fall through to
    -- "Engineering — Other" hid MATE's and Debrecen's agriculture portfolios
    -- from exactly the students they are for.
    when s ~ 'agricultur|horticultur|animal husband|animal scien|animal nutrition|crop|plant protect|plant scien|food scien|food technolog|food safety|food engineer|viticultur|oenolog|aquacultur|fisher|wildlife|forest|soil'
                                                                         then 'agriculture_food'
    -- ------------------------------------------------- remaining engineering
    when s ~ 'engineer'                                                  then 'eng_other'
    -- ------------------------------------------------------- earth & enviro
    when s ~ 'environment|ecolog|climate|geolog|geograph|geoscien|geomat|geoinformat|planetary|earth scien|earth and|earth/|atmospher|meteorol|hydro|water|marine scien|oceanogra|sustainab|renewable|energy|aquatic'
                                                                         then 'earth_environment'
    -- -------------------------------------------------------------- sciences
    when s ~ 'biotechnolog|biolog|biochem|microbiol|molecular|genetic|biophysic|bioinformat|life scien|zoolog|botan'
                                                                         then 'life_sciences'
    when s ~ 'chemis|chimic'                                             then 'chemistry'
    when s ~ 'physic|astronom|astrophys|cosmolog|nuclear|photonic|optic|quantum'
                                                                         then 'physics'
    when s ~ 'mathemat|statistic|actuarial|mathemat'                     then 'mathematics'
    -- -------------------------------------------------------------- business
    when s ~ 'finance|accounting|audit|banking|insurance|invest'          then 'economics_finance'
    when s ~ 'econom'                                                    then 'economics_finance'
    when s ~ 'marketing|advertis|brand|commerce|retail|sales'            then 'business'
    when s ~ 'business|management|mba|entrepreneur|human resource|project management|administration|leadership|organisation|organization'
                                                                         then 'business'
    when s ~ 'tourism|hospitality|hotel|catering|event manage|leisure'   then 'tourism_hospitality'
    -- ------------------------------------------------------ law & society
    when s ~ '\mlaw\M|legal|jurisprud|llm|criminolog'                    then 'law'
    when s ~ 'psycholog'                                                 then 'psychology'
    when s ~ 'educat|teaching|pedagog|didactic|instruction of'           then 'education'
    when s ~ 'politic|international relation|sociolog|social work|social scien|public policy|public governance|public administration|development studies|anthropol|security studies|diplomac'
                                                                         then 'social_sciences'
    -- ------------------------------------------------- arts and humanities
    when s ~ 'music|conducting|singing|instrument|orchestr|opera'        then 'music_performing'
    when s ~ 'theatre|theater|dance|performing|film|cinema|animation|photograph|graphic|design|fine art|visual art|fashion|media|journalis|communicat|advertising'
                                                                         then 'arts_media'
    when s ~ 'histor|philosoph|literature|linguist|language|philolog|classic|archaeolog|theolog|religio|cultural|humanit|studies'
                                                                         then 'humanities'
    when s ~ 'sport|coaching|kinesiolog|physical educat|recreation'      then 'sport'
    -- ------------------------------------------------------- the long tail
    -- Specific leftovers worth naming rather than bucketing.
    when s ~ 'cognitive scien'                                           then 'psychology'
    when s ~ 'nanotech|nanoscien'                                        then 'eng_chemical'
    when s ~ 'translation|interpreting'                                  then 'humanities'
    when s ~ 'health scien|health research'                              then 'nursing_allied'
    when s ~ 'labor relation|labour relation'                            then 'social_sciences'
    when s = 'cs'                                                        then 'computer_science'
    -- Genuinely generic science labels. Matched exactly rather than by
    -- pattern: "Administrative Sciences" and "Health Sciences" contain the
    -- word and are not natural sciences, so a loose /scien/ here would file
    -- them wrongly.
    when s in ('science', 'sciences', 'natural science', 'natural sciences',
               'computational / natural sciences', 'arts and sciences (multiple departments)',
               'transdisciplinary art and science')                      then 'natural_sciences'
    else null
  end
  from t;
$$;

comment on function public.classify_core_field is
  'Maps a programme''s free-text core_field to a field_groups slug. Ordered most specific first; returns null when nothing matches, because a wrong group is worse than none.';

-- ------------------------------------------------- the column and trigger
alter table public.programs add column if not exists field_group text;

alter table public.programs drop constraint if exists programs_field_group_fkey;
alter table public.programs
  add constraint programs_field_group_fkey
  foreign key (field_group) references public.field_groups (slug)
  on update cascade on delete set null;

comment on column public.programs.field_group is
  'DERIVED from core_field by classify_core_field(), maintained by trigger. The broad field a programme belongs to; core_field remains the specific one.';

create index if not exists programs_field_group_idx on public.programs (field_group);

create or replace function public.set_program_field_group()
returns trigger
language plpgsql
as $$
begin
  -- Only when the classification could actually change, so an unrelated update
  -- does not re-run the regex over a row that has not moved.
  if tg_op = 'INSERT' or new.core_field is distinct from old.core_field then
    -- 'other' rather than null where the rules cannot place it. The picker
    -- lists specifics BY group, so a null group would make that programme
    -- unselectable — invisible to the one student it suits. classify_ stays
    -- honest and returns null; the fallback is applied here, where the
    -- consequence lives. A programme with no core_field at all is left alone.
    new.field_group := case
      when new.core_field is null or btrim(new.core_field) = '' then null
      else coalesce(public.classify_core_field(new.core_field), 'other')
    end;
  end if;
  return new;
end $$;

drop trigger if exists programs_set_field_group on public.programs;
create trigger programs_set_field_group
  before insert or update of core_field on public.programs
  for each row execute function public.set_program_field_group();

-- Everything already on file, through the same fallback the trigger applies.
update public.programs
   set field_group = case
     when core_field is null or btrim(core_field) = '' then null
     else coalesce(public.classify_core_field(core_field), 'other')
   end
 where field_group is distinct from case
     when core_field is null or btrim(core_field) = '' then null
     else coalesce(public.classify_core_field(core_field), 'other')
   end;

-- ------------------------------------------------- a student's interests
--
-- Two levels, as asked: broad fields and, optionally, specific core_fields
-- within them. Arrays rather than join tables because these are a short,
-- unordered set of labels read together with the student and never joined
-- against on their own.
alter table public.leads add column if not exists interest_field_groups text[] not null default '{}';
alter table public.leads add column if not exists interest_core_fields text[] not null default '{}';

comment on column public.leads.interest_field_groups is
  'Broad study fields the student is interested in (field_groups.slug). The first level of the course-of-interest picker.';
comment on column public.leads.interest_core_fields is
  'Specific programme core_field values the student is interested in, within the chosen broad fields. Free text because that is what core_field is.';

-- course_of_interest stays, and stays readable.
--
-- It is printed on the generated agreement the student signs, and is read by
-- the lead detail page and the students list. Rather than change every one of
-- those, it becomes a rendering of the selections — but ONLY when there are
-- selections, so the older free-text paths (the lead form, the lead CSV
-- import) that write it directly are left alone.
create or replace function public.sync_course_of_interest()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parts text[];
begin
  if coalesce(array_length(new.interest_core_fields, 1), 0) > 0 then
    -- The specific fields are what a student actually named, so they are what
    -- the agreement should say.
    parts := new.interest_core_fields;
  elsif coalesce(array_length(new.interest_field_groups, 1), 0) > 0 then
    select array_agg(g.name order by g.sort_order)
      into parts
      from field_groups g
     where g.slug = any(new.interest_field_groups);
  else
    -- No structured selection: leave whatever was typed.
    return new;
  end if;

  new.course_of_interest := array_to_string(parts, ', ');
  return new;
end $$;

drop trigger if exists leads_sync_course_of_interest on public.leads;
create trigger leads_sync_course_of_interest
  before insert or update of interest_field_groups, interest_core_fields on public.leads
  for each row execute function public.sync_course_of_interest();

-- ------------------------------------------------------------- the students
-- students enumerates its columns, so the new ones have to be named here too.
-- security_invoker stays on: without it the view reads as its owner and every
-- student on it becomes visible to anybody who can select from it.
drop view if exists public.students;
create view public.students
with (security_invoker = on)
as
  select id, date_of_inquiry, platform_source, full_name, contact_number, email,
         current_qualification, level_applying_for, course_of_interest, country_of_interest,
         assigned_counselor_id, status, created_at, updated_at, date_of_birth, address,
         home_phone, finalized_course_of_interest, university_applying_to,
         emergency_contact_name, emergency_contact_relation, emergency_contact_number,
         registered_at, auth_user_id, portal_active, campaign_id, registration_status,
         discount_amount, discount_reason, intake, processing_officer_id,
         student_code, interest_field_groups, interest_core_fields
  from public.leads
  where registered_at is not null;

grant select, insert, update, delete on public.students to authenticated, anon, service_role;
