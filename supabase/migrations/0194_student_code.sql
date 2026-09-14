-- A student's own number, stamped when they register.
--
--   HMC-SEP26-IT-0001
--   |   |     |  |
--   |   |     |  a serial that never restarts, so a code is never reused
--   |   |     the country they registered for
--   |   the month and year they registered, in Karachi
--   the agency
--
-- Stamped by a trigger rather than by the registration action, because a
-- student can become registered from more than one place — the registration
-- form, a restarted intake cycle, an admin fixing a status by hand — and a
-- number that only some of those routes hand out is worse than none.

-- ------------------------------------------------------------- the serial
-- A sequence, not max()+1: two people registering a student in the same
-- second would otherwise take the same number, and the unique index would
-- turn that into an error in front of one of them.
create sequence if not exists public.student_code_seq as bigint start with 1;

alter table public.leads add column if not exists student_code text;

comment on column public.leads.student_code is
  'HMC-<MONYY>-<country>-<serial>, stamped once when the student registers. Never reissued, never recalculated: it is on their agreement and their receipt.';

-- Null until they register, unique once it exists.
create unique index if not exists leads_student_code_key
  on public.leads (student_code)
  where student_code is not null;

-- ------------------------------------------------------ building the code
-- The month name is built from a fixed array rather than to_char(...,'MON'),
-- which answers in whatever lc_time the connection happens to carry. A code
-- that says SET instead of SEP because a session asked in Italian would be
-- wrong for the life of the student.
create or replace function public.format_student_code(registered timestamptz, country text)
returns text
language sql
immutable
as $$
  select 'HMC-'
    || (array['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'])[
         extract(month from (registered at time zone 'Asia/Karachi'))::int]
    || to_char(registered at time zone 'Asia/Karachi', 'YY')
    || '-' || upper(coalesce(nullif(trim(country), ''), 'XX'))
    || '-' || lpad(nextval('public.student_code_seq')::text, 4, '0');
$$;

comment on function public.format_student_code is
  'Builds the next student code. Consumes a sequence value on every call, so call it only when a code is actually being stamped.';

-- The country the student registered for: their primary destination, falling
-- back to a backup one if that is somehow all they have.
create or replace function public.student_primary_country(lead uuid)
returns text
language sql
stable
as $$
  select d.country_code
  from public.lead_destinations ld
  join public.destinations d on d.id = ld.destination_id
  where ld.lead_id = lead
  order by ld.is_backup nulls first, ld.created_at
  limit 1;
$$;

-- --------------------------------------------------------------- stamping
create or replace function public.stamp_student_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  country text;
begin
  -- Only once, and only for a student who has actually registered. A code
  -- already stamped is never rebuilt: it is on their agreement by then.
  if new.student_code is not null then
    return new;
  end if;
  if new.registration_status is distinct from 'registered' or new.registered_at is null then
    return new;
  end if;

  country := public.student_primary_country(new.id);
  -- No destination on file yet. Left unstamped on purpose rather than given
  -- an XX that would outlive the gap — the trigger on lead_destinations
  -- picks it up the moment a country is chosen.
  if country is null then
    return new;
  end if;

  new.student_code := public.format_student_code(new.registered_at, country);
  return new;
end;
$$;

drop trigger if exists leads_stamp_student_code on public.leads;
create trigger leads_stamp_student_code
  before insert or update of registration_status, registered_at on public.leads
  for each row execute function public.stamp_student_code();

-- A student registered before their country was chosen gets their code when
-- it is. Statement-level would be neater but this fires rarely.
create or replace function public.stamp_student_code_on_destination()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.leads%rowtype;
  country text;
begin
  select * into target from public.leads where id = new.lead_id;
  if target.id is null or target.student_code is not null then
    return new;
  end if;
  if target.registration_status is distinct from 'registered' or target.registered_at is null then
    return new;
  end if;

  country := public.student_primary_country(new.lead_id);
  if country is null then
    return new;
  end if;

  update public.leads
     set student_code = public.format_student_code(target.registered_at, country)
   where id = new.lead_id and student_code is null;
  return new;
end;
$$;

drop trigger if exists lead_destinations_stamp_student_code on public.lead_destinations;
create trigger lead_destinations_stamp_student_code
  after insert on public.lead_destinations
  for each row execute function public.stamp_student_code_on_destination();

-- ------------------------------------------------------------- the twenty-four
-- Everyone already registered gets the code they would have had: their own
-- registration month and their own country, numbered in the order they
-- actually registered, so the serial reads as the history it describes.
do $$
declare
  r record;
  country text;
begin
  for r in
    select id, registered_at from public.leads
    where registration_status = 'registered' and registered_at is not null and student_code is null
    order by registered_at, id
  loop
    country := public.student_primary_country(r.id);
    if country is not null then
      update public.leads
         set student_code = public.format_student_code(r.registered_at, country)
       where id = r.id;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- the view
-- students enumerates its columns, so the new one has to be named here too.
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
         student_code
  from public.leads
  where registered_at is not null;

grant select, insert, update, delete on public.students to authenticated, anon, service_role;
