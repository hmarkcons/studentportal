-- The finalised university, recorded once and shown by every country's
-- documentation tracker.
--
-- Three things, all one idea: the university a student is actually proceeding
-- with for the visa is decided in one place — the Finalize button on the
-- Applications tab — and the tracker should read it rather than ask for it
-- again.
--
-- 1. Which tracker field holds it, said by a flag rather than by its name.
-- 2. What the act is called, per destination, rather than "Italy means
--    pre-enrolment" hardcoded in three components.
-- 3. Filling it in automatically when an application is finalised.

-- ------------------------------------------------ 1. which field holds it
-- UK and US already have a "Finalized university" select and Italy has
-- "Pre-enrollment university". They are the same field under different names,
-- which is exactly why this cannot key off the name: a new destination may
-- call it something else again. The flag says what the field is for; the label
-- stays whatever that country calls it.
alter table tracker_definitions
  add column if not exists is_finalized_university boolean not null default false;

comment on column tracker_definitions.is_finalized_university is
  'This field records the university the student is proceeding with for the visa. Filled automatically from the finalised application; at most one per country.';

update tracker_definitions
   set is_finalized_university = true
 where (country_code = 'IT' and field_key = 'preenrollment_university')
    or (country_code in ('UK', 'US') and field_key = 'finalized_university');

-- One per country, or "the finalised university" would be ambiguous.
create unique index if not exists tracker_definitions_one_finalized_university
  on tracker_definitions (country_code)
  where is_finalized_university;

-- Every country's tracker gets one. Five destinations had no university field
-- at all (Germany, France, Austria, Hungary, Luxembourg), so "automatically
-- select the finalised university for any country" could not hold for them.
-- Sorted to the top: it is the first thing the rest of the tracker depends on.
--
-- An empty options array is how this schema says "fill the choices from the
-- student's own applications" — the same as Italy's pre-enrolment field.
insert into tracker_definitions (country_code, field_key, label, field_type, options, sort_order, is_finalized_university)
select distinct d.country_code, 'finalized_university', 'University finalized', 'select', '[]'::jsonb, 5, true
  from destinations d
 where exists (select 1 from tracker_definitions t where t.country_code = d.country_code)
   and not exists (
     select 1 from tracker_definitions t
      where t.country_code = d.country_code and t.is_finalized_university
   )
on conflict (country_code, field_key) do nothing;

-- ------------------------------------------------- 2. what the act is called
-- "Italy means pre-enrolment" was a country-code comparison in the finalize
-- button, the applications list and the student layout. A destination added
-- tomorrow may have its own word for the same step, and nobody should need a
-- developer to introduce it.
alter table destinations
  add column if not exists finalize_action_label text not null default 'Finalize for visa';
alter table destinations
  add column if not exists finalized_badge_label text not null default 'Finalized for visa';

comment on column destinations.finalize_action_label is
  'What the act of choosing the university to proceed with is called here — the button on the Applications tab.';
comment on column destinations.finalized_badge_label is
  'What that state is called once done — the badge on the application.';

update destinations
   set finalize_action_label = 'Pre-Enroll University',
       finalized_badge_label = 'Pre-Enrolled'
 where country_code = 'IT';

-- ------------------------------------------------------- 3. filling it in
-- The tracker holds its answers per application (application_country_extra),
-- anchored to a country's earliest application — the same row the dashboard
-- reads. The value of a university select is an application id, which is what
-- the form's options carry.
create or replace function sync_finalized_university_field(p_student_id uuid, p_destination_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_country text;
  v_field text;
  v_anchor uuid;
  v_finalized uuid;
begin
  select country_code into v_country from destinations where id = p_destination_id;
  if v_country is null then
    return;
  end if;

  select field_key into v_field
    from tracker_definitions
   where country_code = v_country and is_finalized_university
   limit 1;
  if v_field is null then
    return;
  end if;

  -- Where the dashboard reads this country's tracker from.
  select a.id into v_anchor
    from applications a
    join universities u on u.id = a.university_id
   where a.student_id = p_student_id and u.destination_id = p_destination_id
   order by a.created_at asc, a.id asc
   limit 1;
  if v_anchor is null then
    return;
  end if;

  select a.id into v_finalized
    from applications a
    join universities u on u.id = a.university_id
   where a.student_id = p_student_id
     and u.destination_id = p_destination_id
     and a.is_finalized
   limit 1;

  if v_finalized is null then
    -- Un-finalised: the tracker must not keep naming a university nobody is
    -- proceeding with.
    delete from application_country_extra
     where application_id = v_anchor and field_key = v_field;
    return;
  end if;

  insert into application_country_extra (application_id, field_key, field_value)
  values (v_anchor, v_field, v_finalized::text)
  on conflict (application_id, field_key) do update set field_value = excluded.field_value;
end;
$$;

-- Fires however the flag moves: the finalize RPC, the un-finalize action, or a
-- correction made directly. A trigger rather than a line in each caller, so
-- the tracker cannot drift from the Applications tab.
create or replace function sync_finalized_university_on_application() returns trigger
language plpgsql
security definer
as $$
declare
  v_destination uuid;
begin
  if tg_op = 'UPDATE' and new.is_finalized is not distinct from old.is_finalized then
    return new;
  end if;

  select destination_id into v_destination from universities where id = new.university_id;
  if v_destination is not null then
    perform sync_finalized_university_field(new.student_id, v_destination);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_finalized_university on applications;
create trigger trg_sync_finalized_university
  after insert or update of is_finalized on applications
  for each row execute function sync_finalized_university_on_application();

-- Bring existing students in line, so the field is right before anybody looks.
do $$
declare
  r record;
begin
  for r in
    select distinct a.student_id, u.destination_id
      from applications a
      join universities u on u.id = a.university_id
  loop
    perform sync_finalized_university_field(r.student_id, r.destination_id);
  end loop;
end $$;
