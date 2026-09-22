-- A student's number says which intake they belong to, and where in it.
--
--   HMC-FALL26-IT-0002
--   |   |      |  |
--   |   |      |  their place in that intake, by registration date
--   |   |      the country they registered for
--   |   the intake
--   the agency
--
-- Four things change from 0194.
--
-- 1. The intake replaces the registration month. A student registered in
--    September for a Spring intake was stamped SEP26, which is not the cycle
--    they are in and not what the office calls them by. The registration date
--    is still recorded, and is shown and filterable in the registered-students
--    table, so nothing is lost by taking it out of the code.
--
-- 2. The running number restarts at 0001 for every intake, and counts across
--    every country within it. So Fall 2026 reads 0001, 0002, 0003 whether
--    those three students are going to Italy, Turkey or Germany, and Spring
--    2027 starts again at 0001. A number is never reused inside an intake, so
--    the intake and the number together identify one student for good.
--
-- 3. A student whose intake is not known yet HOLDS A PLACE, and that is what
--    makes the running order mean what it says. When a number is handed out in
--    any intake, the numbers belonging to registered students who came first
--    and are still waiting for an intake are held back first. So a student who
--    registered on the 12th and has no intake yet keeps 0001, and the student
--    who registered on the 20th takes 0002 — the later registration cannot
--    overtake the earlier one.
--
--    The cost, accepted deliberately: a held place is only ever claimed in the
--    intake the student actually lands in. Every other intake keeps the gap
--    forever. An intake can therefore have holes in it, and that is the
--    correct reading of the history rather than a fault.
--
-- 4. Existing codes are reissued in the new shape. The old value is kept in
--    legacy_student_codes rather than thrown away: it is on agreements and
--    receipts already in students' hands, and somebody quoting one has to be
--    findable.
--
-- Two rules the office set that this has to honour, and which pull against
-- each other:
--
--   * A number, once issued, is never renumbered to make room for somebody
--     else. A back-dated import takes the next free numbers in its intake even
--     though those students registered earlier than the ones already numbered,
--     because their codes are on paperwork that has already gone out.
--   * A student whose intake arrives late still gets the place they held.
--
-- Both hold because a place is taken at registration and a number is taken
-- when the intake is known — never the other way round.
--
-- A student with no intake gets no code, and the portal holds them out until
-- one is set. Their place is already reserved, so recording the intake later
-- simply hands them the number they were always going to have.

-- ------------------------------------------------------------ precondition
--
-- The reissue below rewrites every registered student's code. Running it a
-- second time would archive perfectly good codes and mint fresh ones, which
-- is exactly what rule 1 forbids. So it refuses once any student has been
-- numbered under this scheme.
-- Nested rather than one `and`, and the inner query run through EXECUTE. A
-- single IF condition is planned as one statement, so naming a column that
-- does not exist yet fails to parse on a database where this has never run —
-- which is the one case the guard has to stay quiet for.
do $$
declare
  numbered bigint;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'leads' and column_name = 'student_intake_code'
  ) then
    execute 'select count(*) from public.leads where student_intake_code is not null' into numbered;
    if numbered > 0 then
      raise exception
        '0260 has already been applied: % students are numbered by intake. Re-running would reissue codes that are already on paperwork.',
        numbered;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------- columns
alter table public.leads
  add column if not exists student_seq bigint,
  add column if not exists student_intake_code text,
  add column if not exists student_intake_seq integer,
  add column if not exists legacy_student_codes text[] not null default '{}'::text[];

comment on column public.leads.student_seq is
  'The student''s place in the agency-wide running order, taken the moment they register and never reused. Held even while their intake is unknown, so a later registration cannot overtake them. This is not the number in their code — see student_intake_seq.';
comment on column public.leads.student_intake_code is
  'The intake token their number belongs to: FALL26, SPR27. Null until an intake is recorded.';
comment on column public.leads.student_intake_seq is
  'Their place within that intake, counting from 1 across every country. Reserved as soon as the intake is known, even if the country is not yet.';
comment on column public.leads.legacy_student_codes is
  'Every code this student has carried and no longer does — the 0194 one, and any superseded by an intake correction. Kept so somebody quoting an old agreement or receipt can still be found.';

create unique index if not exists leads_student_seq_key
  on public.leads (student_seq)
  where student_seq is not null;

-- One number per intake. This is the constraint that makes a code identify a
-- student: two students in the same intake can never share a place, whatever
-- countries they are going to.
create unique index if not exists leads_student_intake_number_key
  on public.leads (student_intake_code, student_intake_seq)
  where student_intake_code is not null and student_intake_seq is not null;

-- ------------------------------------------------- the per-intake counters
--
-- A counter row per intake rather than max()+1 over leads, for the same
-- reason 0194 used a sequence: two people registering students in the same
-- second would otherwise read the same maximum and collide. The row is locked
-- by the upsert, so the second waits.
--
-- It cannot be a real sequence, because the set of intakes is open — the
-- office invents "Spring/Summer & Fall/Winter 2029" whenever it needs to.
create table if not exists public.student_intake_counters (
  intake_code text primary key,
  last_seq integer not null default 0
);

comment on table public.student_intake_counters is
  'Highest place handed out in each intake, whether to a student or to a held place. Never decreases: a freed place is left as a gap rather than reused.';

-- Nothing outside the numbering functions has any business reading or writing
-- this, and those are security definer. RLS on with no policy says exactly
-- that; the table owner (and so the definer functions) still passes.
alter table public.student_intake_counters enable row level security;

-- --------------------------------------------------------- the held places
create table if not exists public.student_code_holds (
  intake_code text not null,
  seq integer not null,
  lead_id uuid not null references public.leads (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (intake_code, seq),
  unique (intake_code, lead_id)
);

comment on table public.student_code_holds is
  'A place kept in an intake for a student who registered before it was handed out but has no intake recorded yet. Claimed if they land in that intake; left as a permanent gap if they land in another.';

alter table public.student_code_holds enable row level security;

-- ------------------------------------------------------------- the intake code
--
-- Intake values are written by destination and vary a lot: "Fall 2026",
-- "September/Fall 2027", "Spring/Summer & Fall/Winter 2027", and free text for
-- destinations configured that way (see src/lib/intake.ts). This reduces one
-- to a short token a person can read out over the phone.
--
-- The first season word it recognises wins, so "September/Fall" reads SEP and
-- "Spring/Summer & Fall/Winter" reads SPR. Two different intakes can reduce to
-- the same token; that is cosmetic and safe, because the number after it is
-- allocated per token, so the two share one running order rather than
-- colliding.
create or replace function public.intake_code(intake text)
returns text
language plpgsql
immutable
as $$
declare
  raw text := upper(btrim(coalesce(intake, '')));
  yr text;
  head text;
  season text;
  word text;
  known text[][] := array[
    ['JAN', 'JANUARY'], ['FEB', 'FEBRUARY'], ['MAR', 'MARCH'], ['APR', 'APRIL'],
    ['MAY', 'MAY'], ['JUN', 'JUNE'], ['JUL', 'JULY'], ['AUG', 'AUGUST'],
    ['SEP', 'SEPTEMBER'], ['OCT', 'OCTOBER'], ['NOV', 'NOVEMBER'], ['DEC', 'DECEMBER'],
    ['SPR', 'SPRING'], ['SUM', 'SUMMER'], ['FALL', 'FALL'], ['FALL', 'AUTUMN'],
    ['WIN', 'WINTER']
  ];
  i int;
begin
  if raw = '' then
    return null;
  end if;

  -- The year is the last four digits in the value; without one there is no
  -- intake code worth minting.
  yr := substring(raw from '(\d{4})\s*$');
  if yr is null then
    return null;
  end if;
  head := btrim(regexp_replace(raw, '(\d{4})\s*$', ''));

  -- The first recognised season word, reading left to right.
  for word in select unnest(regexp_split_to_array(head, '[^A-Z]+')) loop
    if word is null or word = '' then
      continue;
    end if;
    for i in 1 .. array_length(known, 1) loop
      if word = known[i][2] then
        season := known[i][1];
        exit;
      end if;
    end loop;
    exit when season is not null;
  end loop;

  -- Nothing recognised: fall back to the first four letters of whatever was
  -- written, so a free-text intake still produces something readable rather
  -- than nothing at all.
  if season is null then
    season := substring(regexp_replace(head, '[^A-Z]', '', 'g') from 1 for 4);
  end if;
  if season is null or season = '' then
    return null;
  end if;

  return season || substring(yr from 3 for 2);
end;
$$;

comment on function public.intake_code is
  'Reduces a stored intake to a short token for the student code: "Fall 2026" -> FALL26, "September/Fall 2027" -> SEP27. Null when there is no four-digit year to key it on, which is how a student is held without a code.';

-- ------------------------------------------------------------ composing a code
-- Takes the intake token and the number as given rather than deriving them,
-- because by the time this is called both have been allocated and written
-- down. Deriving them again is how a code and the number behind it drift.
-- Defensive: `create or replace` overloads rather than replaces when the
-- argument types differ, so a name left behind by an earlier draft would sit
-- alongside this one and get picked by the wrong call.
drop function if exists public.compose_student_code(bigint, text, text);

create or replace function public.compose_student_code(ic text, country text, seq integer)
returns text
language sql
immutable
as $$
  select case
    when ic is null or seq is null then null
    when coalesce(nullif(btrim(country), ''), '') = '' then null
    else 'HMC-' || ic || '-' || upper(btrim(country)) || '-' || lpad(seq::text, 4, '0')
  end;
$$;

comment on function public.compose_student_code is
  'HMC-<intake>-<country>-<place in the intake>. Null when the intake, the country or the place is missing.';

-- ----------------------------------------------------- handing out a number
create or replace function public.next_intake_number(ic text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.student_intake_counters (intake_code, last_seq)
  values (ic, 1)
  on conflict (intake_code) do update
    set last_seq = student_intake_counters.last_seq + 1
  returning last_seq;
$$;

comment on function public.next_intake_number is
  'The next free place in an intake. Advances the counter, so call it only when a place is actually being taken — by a student or by a hold.';

-- ------------------------------------------------------ holding places back
--
-- Called immediately before a number is handed out in an intake. Everyone who
-- registered earlier and is still waiting for an intake takes their place in
-- this intake first, in the order they registered.
--
-- Once held, a place is never re-held: the `not exists` is what stops the same
-- waiting student consuming a fresh number every time somebody else is
-- numbered in the same intake.
create or replace function public.hold_places_before(ic text, before_place bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  waiting record;
begin
  for waiting in
    select l.id
      from public.leads l
     where l.registered_at is not null
       and l.student_seq is not null
       and l.student_seq < before_place
       -- No number anywhere yet, and no intake to give them one.
       and l.student_intake_seq is null
       and public.intake_code(l.intake) is null
       and not exists (
             select 1
               from public.student_code_holds h
              where h.intake_code = ic and h.lead_id = l.id)
     order by l.student_seq
  loop
    insert into public.student_code_holds (intake_code, seq, lead_id)
    values (ic, public.next_intake_number(ic), waiting.id);
  end loop;
end;
$$;

comment on function public.hold_places_before is
  'Reserves a place in the given intake for every registered student who came before this point in the running order and has no intake yet, so a later registration cannot take their number.';

-- --------------------------------------------------------- issuing the code
--
-- The one place a student's number and code are decided. Every route into
-- registration ends here: the registration form, the bulk import, an admin
-- correcting a status, a country arriving late, an intake arriving late.
--
-- It is safe to call at any time and as often as you like. A student already
-- numbered in the intake they are in, with a code, is left exactly alone —
-- that code is on their agreement.
create or replace function public.issue_student_number(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leads%rowtype;
  ic text;
  place integer;
  held integer;
  country text;
  new_code text;
begin
  select * into l from public.leads where id = target;
  if l.id is null then
    return;
  end if;
  -- registered_at is the whole test, as 0198 established: registration_status
  -- defaults to 'registered' on every lead ever created, so it gates nothing.
  -- A withdrawn student who was registered keeps their number — they had one.
  if l.registered_at is null then
    return;
  end if;
  -- The place in the running order is taken by the before-insert trigger. No
  -- place, not registered through any route this knows about.
  if l.student_seq is null then
    return;
  end if;

  ic := public.intake_code(l.intake);
  if ic is null then
    -- Waiting for an intake. They keep their place in the running order and
    -- will be held a number in whichever intake hands one out next.
    return;
  end if;

  -- Already numbered in this intake and already coded: nothing to decide.
  if l.student_intake_code = ic and l.student_code is not null then
    return;
  end if;

  if l.student_intake_code is distinct from ic then
    -- A first number, or the student has been moved to a different intake
    -- (a correction — the code has to name the cycle they are actually in,
    -- or it is worse than no code at all).
    select h.seq into held
      from public.student_code_holds h
     where h.intake_code = ic and h.lead_id = l.id;

    if held is null then
      perform public.hold_places_before(ic, l.student_seq);
      place := public.next_intake_number(ic);
    else
      -- They land in the intake that held a place for them. It is theirs.
      place := held;
      delete from public.student_code_holds h
       where h.intake_code = ic and h.lead_id = l.id;
    end if;
  else
    -- Numbered here already, but with no code — the country had not arrived.
    place := l.student_intake_seq;
  end if;

  country := public.student_primary_country(l.id);
  -- Null when there is no destination on file yet. The number stays reserved
  -- and the code waits; the trigger on lead_destinations finishes the job.
  new_code := public.compose_student_code(ic, country, place);

  update public.leads
     set student_intake_code = ic,
         student_intake_seq = place,
         legacy_student_codes = case
           when l.student_code is not null and new_code is distinct from l.student_code
             then array_append(l.legacy_student_codes, l.student_code)
           else l.legacy_student_codes
         end,
         student_code = new_code
   where id = l.id
     -- Nothing to write, no row updated, no after-trigger. This is what
     -- terminates the recursion: trg_leads_issue_student_number fires on
     -- every update, so this statement calls this function again, and the
     -- second pass has to find the work already done and stop.
     and (student_intake_code is distinct from ic
          or student_intake_seq is distinct from place
          or student_code is distinct from new_code);
end;
$$;

comment on function public.issue_student_number is
  'Gives a registered student their place in their intake and composes their code, if both the intake and the country are known. Idempotent, and never rewrites a code that is already right.';

-- --------------------------------------------------------------- the triggers
--
-- Two, because they do different jobs at different times. The place has to be
-- taken BEFORE the row lands, so it can be written into it; the number can
-- only be handed out AFTER, because holding places back reads the same table.
create or replace function public.reserve_student_place()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- See 0198: registered_at, not registration_status, is what says registered.
  if new.registered_at is null then
    return new;
  end if;
  -- Unconditional and first: this is what stops a later registration
  -- overtaking a student who is only waiting for an intake.
  if new.student_seq is null then
    new.student_seq := nextval('public.student_code_seq');
  end if;
  return new;
end;
$$;

comment on function public.reserve_student_place is
  'Takes the student''s place in the agency-wide running order the moment they register, whether or not their intake is known.';

create or replace function public.issue_student_number_on_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.issue_student_number(new.id);
  return null;
end;
$$;

-- The country arrives after registration for some students; so can the
-- intake. Both routes end in the same call.
create or replace function public.issue_student_number_on_destination()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.issue_student_number(new.lead_id);
  return null;
end;
$$;

-- 0194's names and 0198's, because 0198 renamed one and both may be live.
drop trigger if exists leads_stamp_student_code on public.leads;
drop trigger if exists trg_leads_stamp_student_code on public.leads;
drop trigger if exists leads_reserve_student_place on public.leads;
drop trigger if exists trg_leads_reserve_student_place on public.leads;
drop trigger if exists leads_issue_student_number on public.leads;
drop trigger if exists trg_leads_issue_student_number on public.leads;
drop trigger if exists lead_destinations_stamp_student_code on public.lead_destinations;
drop trigger if exists trg_lead_destinations_stamp_student_code on public.lead_destinations;
drop trigger if exists lead_destinations_issue_student_number on public.lead_destinations;
drop trigger if exists trg_lead_destinations_issue_student_number on public.lead_destinations;

-- Two things 0198 paid for the hard way, both kept here.
--
-- No column list. The one-click Register action on the lead page updates
-- `status` alone and lets handle_lead_registration() set registered_at — a
-- trigger listening for `update of registration_status, registered_at` never
-- fires on that path, and 0194's did not, so those students got no code at
-- all. Firing on everything is the only gate nothing slips past.
--
-- And the name. Postgres fires same-timing triggers in name order, and
-- handle_lead_registration runs as trg_leads_registration — "registration"
-- sorts before "reserve", so registered_at is already set by the time this
-- reads it. Renaming this trigger without checking that is how 0194 ended up
-- stamping codes off a null date.
create trigger trg_leads_reserve_student_place
  before insert or update on public.leads
  for each row execute function public.reserve_student_place();

-- Broad for the same reason. Which is also why issue_student_number()'s own
-- UPDATE has to change something to fire at all — see the `is distinct from`
-- guard on its where clause, without which this trigger calls itself forever
-- for a student who has a number but no country yet.
create trigger trg_leads_issue_student_number
  after insert or update on public.leads
  for each row execute function public.issue_student_number_on_lead();

create trigger trg_lead_destinations_issue_student_number
  after insert on public.lead_destinations
  for each row execute function public.issue_student_number_on_destination();

-- Only now that nothing points at them. 0194's builder in particular consumed
-- a sequence value on every call, which is the exact shape of bug this
-- replaces, so it should not be left within reach.
drop function if exists public.stamp_student_code();
drop function if exists public.stamp_student_code_on_destination();
drop function if exists public.format_student_code(timestamptz, text);

-- --------------------------------------------------------------- the reissue
--
-- Every registered student, in the order they actually registered, so the
-- running order reads as the history it describes. Their 0194 code is kept
-- alongside rather than overwritten.
--
-- A student with no intake on file comes out of this with a place and no code,
-- which is the intended state: they hold their number until the office records
-- an intake for them, and the portal holds them out until it does.
-- The triggers come off for the duration, and go back on below.
--
-- Not tidiness. Both of them fire on every insert and update, so the archive
-- statement alone would have the before-trigger hand out a place and the
-- after-trigger immediately number anybody with an intake — in whatever order
-- the UPDATE happened to scan the table. Those students would then be numbered
-- before the loop that exists to number them by registration date, and the
-- loop would find them already done and leave them. The result looks fine and
-- is in the wrong order, permanently.
alter table public.leads disable trigger trg_leads_reserve_student_place;
alter table public.leads disable trigger trg_leads_issue_student_number;

do $$
declare
  r record;
begin
  -- Start again from one. Every existing code is being reissued, so the old
  -- serials are not being preserved and nothing collides.
  perform setval('public.student_code_seq', 1, false);
  delete from public.student_code_holds;
  delete from public.student_intake_counters;

  -- Archive and clear, in one statement, so the loop below is only ever
  -- handing out new numbers.
  update public.leads
     set legacy_student_codes = case
           when student_code is null then legacy_student_codes
           else array_append(legacy_student_codes, student_code)
         end,
         student_code = null,
         student_seq = null,
         student_intake_code = null,
         student_intake_seq = null
   where registered_at is not null;

  for r in
    select id
      from public.leads
     where registered_at is not null
     order by registered_at, id
  loop
    update public.leads set student_seq = nextval('public.student_code_seq') where id = r.id;
    perform public.issue_student_number(r.id);
  end loop;
end $$;

alter table public.leads enable trigger trg_leads_reserve_student_place;
alter table public.leads enable trigger trg_leads_issue_student_number;

-- --------------------------------------------- students may not number themselves
--
-- Same hole 0084 closed for registration_status and the discount columns, and
-- for the same reason: leads_update_self checks only row ownership, so a
-- direct authenticated REST call could otherwise mint a student their own
-- Student ID — which is what the portal now gates access on.
create or replace function restrict_student_lead_self_update() returns trigger
language plpgsql as $$
begin
  if old.auth_user_id = auth.uid() and not is_active_staff() then
    if new.status is distinct from old.status
      or new.registered_at is distinct from old.registered_at
      or new.portal_active is distinct from old.portal_active
      or new.assigned_counselor_id is distinct from old.assigned_counselor_id
      or new.auth_user_id is distinct from old.auth_user_id
      or new.campaign_id is distinct from old.campaign_id
      or new.date_of_inquiry is distinct from old.date_of_inquiry
      or new.platform_source is distinct from old.platform_source
      or new.registration_status is distinct from old.registration_status
      or new.discount_amount is distinct from old.discount_amount
      or new.discount_reason is distinct from old.discount_reason
      or new.intake is distinct from old.intake
      or new.student_code is distinct from old.student_code
      or new.student_seq is distinct from old.student_seq
      or new.student_intake_code is distinct from old.student_intake_code
      or new.student_intake_seq is distinct from old.student_intake_seq
      or new.legacy_student_codes is distinct from old.legacy_student_codes
    then
      raise exception 'Students may only edit their own personal details, not case/registration fields';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- the view
-- students enumerates its columns, so the new ones have to be named here.
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
         student_code, interest_field_groups, interest_core_fields,
         student_seq, student_intake_code, student_intake_seq, legacy_student_codes
  from public.leads
  where registered_at is not null;

grant select, insert, update, delete on public.students to authenticated, anon, service_role;

grant execute on function public.intake_code(text) to authenticated, service_role;
grant execute on function public.compose_student_code(text, text, integer) to authenticated, service_role;
