-- Stamp the student code on every route into registration, not just one.
--
-- 0194 got the gate wrong in two ways, and they hid each other:
--
--   1. It keyed off registration_status = 'registered'. That column defaults
--      to 'registered' on every lead ever created, registered or not — the
--      real gate is registered_at, which is what the students view uses. The
--      condition was therefore meaninglessly true, and looked like it worked.
--
--   2. The trigger was BEFORE UPDATE OF registration_status, registered_at,
--      so it only fired when one of those columns was named in the UPDATE.
--      The one-click Register action on the lead page updates `status` alone
--      and lets handle_lead_registration() stamp registered_at — that path
--      never named either column, so the trigger never ran and the student
--      was left with no code at all.
--
-- Ordering matters too: handle_lead_registration is a BEFORE UPDATE trigger
-- that sets new.registered_at, and Postgres fires same-timing triggers in
-- name order. 'leads_stamp_student_code' sorted before 'trg_leads_registration',
-- so even on a path that did fire it, registered_at was still null. The new
-- name sorts after it.

drop trigger if exists leads_stamp_student_code on public.leads;

create or replace function public.stamp_student_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  country text;
begin
  -- Already has one: never rebuilt. It is on their agreement by now.
  if new.student_code is not null then
    return new;
  end if;
  -- registered_at is the whole test. A withdrawn student who was registered
  -- keeps their number, which is right — they had one.
  if new.registered_at is null then
    return new;
  end if;

  country := public.student_primary_country(new.id);
  -- No destination on file yet: left unstamped rather than given an XX that
  -- would outlive the gap. The lead_destinations trigger picks it up.
  if country is null then
    return new;
  end if;

  new.student_code := public.format_student_code(new.registered_at, country);
  return new;
end;
$$;

-- Fires on every insert and every update, so no route can slip past it, and
-- named to sort after trg_leads_registration so registered_at is already set.
create trigger trg_leads_stamp_student_code
  before insert or update on public.leads
  for each row execute function public.stamp_student_code();

-- The same correction on the destination side.
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
  if target.id is null or target.student_code is not null or target.registered_at is null then
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

-- Anybody the broken gate skipped. Same rule as 0194's backfill: their own
-- month, their own country, in the order they registered.
do $$
declare
  r record;
  country text;
begin
  for r in
    select id, registered_at from public.leads
    where registered_at is not null and student_code is null
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
