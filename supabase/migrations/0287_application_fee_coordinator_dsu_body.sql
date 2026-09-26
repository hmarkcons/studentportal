-- Three things the catalogue did not record: what applying costs, who
-- coordinates each programme, and which DSU body pays a university's
-- students.
--
--   universities.application_fee, application_fee_currency
--   programs.application_fee, application_fee_currency
--     A university usually charges one fee whatever the programme, so it is
--     kept on the university, and a programme records its own only where it
--     differs: the programme's fee when it has one, else the university's.
--     A fee saved without a currency takes the university's, else the
--     destination's — so a fee on file always says what it is in.
--
--   programs.coordinator_email
--     Beside the university's contact_email, which reaches admissions in
--     general rather than the person running the course.
--
--   universities.dsu_body_id
--     The regional body (DSU Toscana, ER.GO, DiSCo Lazio…) from Setup →
--     Scholarship bodies. Until now the student's Scholarship tab guessed it
--     from the university's name (scholarshipMatch.ts); once set, this is the
--     answer and the guess is only the fallback.
--
--   applications.application_fee_currency
--     An application already carried its own fee, typed per student. A new
--     application is now pre-filled with its programme's fee — by a trigger,
--     so every path that creates one does it (the form, backups, suggestions,
--     recording an admission) — and the currency travels with it.
--
-- Nothing existing changes: every new column starts empty. Who may edit is
-- unchanged too — UPDATE on universities and programs is Super Admin only
-- (0039).

do $$
begin
  if to_regclass('public.universities') is null or to_regclass('public.programs') is null
     or to_regclass('public.applications') is null or to_regclass('public.scholarship_bodies') is null
     or to_regclass('public.destinations') is null then
    raise exception '0287: universities, programs, applications, scholarship_bodies and destinations must all exist';
  end if;
end $$;

alter table public.universities
  add column if not exists application_fee numeric(10, 2),
  add column if not exists application_fee_currency text,
  add column if not exists dsu_body_id uuid references public.scholarship_bodies (id) on delete set null;

alter table public.programs
  add column if not exists application_fee numeric(10, 2),
  add column if not exists application_fee_currency text,
  add column if not exists coordinator_email text;

alter table public.applications
  add column if not exists application_fee_currency text;

create index if not exists universities_dsu_body_idx on public.universities (dsu_body_id);

-- A fee cannot be negative, a currency is an ISO code, and an email has an @.
alter table public.universities drop constraint if exists universities_application_fee_check;
alter table public.universities add constraint universities_application_fee_check check (
  (application_fee is null or application_fee >= 0)
  and (application_fee_currency is null or application_fee_currency ~ '^[A-Z]{3}$')
);
alter table public.programs drop constraint if exists programs_application_fee_check;
alter table public.programs add constraint programs_application_fee_check check (
  (application_fee is null or application_fee >= 0)
  and (application_fee_currency is null or application_fee_currency ~ '^[A-Z]{3}$')
);
alter table public.programs drop constraint if exists programs_coordinator_email_check;
alter table public.programs add constraint programs_coordinator_email_check check (
  coordinator_email is null or coordinator_email ~ '^[^@[:space:]]+@[^@[:space:]]+$'
);
alter table public.applications drop constraint if exists applications_application_fee_currency_check;
alter table public.applications add constraint applications_application_fee_currency_check check (
  application_fee_currency is null or application_fee_currency ~ '^[A-Z]{3}$'
);

comment on column public.universities.application_fee is
  'What applying costs, for every programme that records no fee of its own (0287).';
comment on column public.programs.application_fee is
  'This programme''s own application fee, where it differs from the university''s (0287).';
comment on column public.programs.coordinator_email is
  'The programme coordinator, beside the university''s general contact_email (0287).';
comment on column public.universities.dsu_body_id is
  'The scholarship body that pays this university''s students; the Scholarship tab offers it rather than guessing (0287).';

-- ---------------------------------------------------------------- currencies
--
-- Security definer so the currency is found whoever writes the row: the
-- lookups are of reference data about the row being written, and nothing is
-- returned to the caller.

create or replace function public.university_fee_currency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.application_fee is not null and new.application_fee_currency is null then
    select d.currency into new.application_fee_currency from destinations d where d.id = new.destination_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_university_fee_currency on public.universities;
create trigger trg_university_fee_currency
  before insert or update of application_fee, application_fee_currency on public.universities
  for each row execute function public.university_fee_currency();

create or replace function public.program_fee_currency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.application_fee is not null and new.application_fee_currency is null then
    select coalesce(u.application_fee_currency, d.currency) into new.application_fee_currency
    from universities u join destinations d on d.id = u.destination_id
    where u.id = new.university_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_program_fee_currency on public.programs;
create trigger trg_program_fee_currency
  before insert or update of application_fee, application_fee_currency on public.programs
  for each row execute function public.program_fee_currency();

-- -------------------------------------------------- an application's own fee
--
-- On insert with no fee: the programme's, else the university's, with its
-- currency. On any write with a fee but no currency: the currency that fee
-- would have come with, else the destination's.

create or replace function public.application_fee_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prog_fee numeric;
  v_prog_cur text;
  v_uni_fee numeric;
  v_uni_cur text;
  v_dest_cur text;
begin
  select p.application_fee, p.application_fee_currency into v_prog_fee, v_prog_cur
  from programs p where p.id = new.program_id;
  select u.application_fee, u.application_fee_currency, d.currency into v_uni_fee, v_uni_cur, v_dest_cur
  from universities u join destinations d on d.id = u.destination_id
  where u.id = new.university_id;

  if tg_op = 'INSERT' and new.application_fee is null then
    if v_prog_fee is not null then
      new.application_fee := v_prog_fee;
      new.application_fee_currency := coalesce(new.application_fee_currency, v_prog_cur);
    elsif v_uni_fee is not null then
      new.application_fee := v_uni_fee;
      new.application_fee_currency := coalesce(new.application_fee_currency, v_uni_cur);
    end if;
  end if;

  if new.application_fee is not null and new.application_fee_currency is null then
    new.application_fee_currency := coalesce(
      case when v_prog_fee is not null then v_prog_cur end,
      v_uni_cur,
      v_dest_cur
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_application_fee_defaults on public.applications;
create trigger trg_application_fee_defaults
  before insert or update of application_fee, application_fee_currency on public.applications
  for each row execute function public.application_fee_defaults();

notify pgrst, 'reload schema';
