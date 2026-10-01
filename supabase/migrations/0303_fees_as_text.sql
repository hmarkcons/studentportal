-- Application fees and tuition, as the office writes them.
--
-- A fee is not always a number: "Free for EU students", "€30 (EU) / €50
-- (non-EU)", "Waived until 31 March", "€3,000 per year". The four columns that
-- held one as numeric now hold text:
--
--   universities.application_fee, programs.application_fee,
--   programs.tuition_fee, and applications.application_fee — which the
--   application copies from its programme or university when it is made
--   (0287), and so has to be able to hold whatever they hold.
--
-- Existing amounts are kept, written the way they were shown: 30.00 as "30",
-- 45.50 as "45.50". A plain amount still shows in its currency (€30); anything
-- else shows exactly as typed. The currency columns and their ISO check stay.
-- A fee may no longer be negative only because it may no longer be a number;
-- it may not be blank (null is "none") or longer than 120 characters.
--
-- 0287's triggers name these columns in UPDATE OF, and Postgres refuses to
-- change the type of a column a trigger names; they are dropped, and put back
-- after. application_fee_defaults() read the fees into numeric variables, and
-- is recreated reading text.
--
-- Safe to run again: a column already text is left as it is.

do $$
begin
  if to_regprocedure('public.application_fee_defaults()') is null
     or to_regprocedure('public.university_fee_currency()') is null
     or to_regprocedure('public.program_fee_currency()') is null then
    raise exception '0303: the fee functions from 0287 are missing — apply 0287 first';
  end if;
end $$;

drop trigger if exists trg_university_fee_currency on public.universities;
drop trigger if exists trg_program_fee_currency on public.programs;
drop trigger if exists trg_application_fee_defaults on public.applications;

alter table public.universities drop constraint if exists universities_application_fee_check;
alter table public.programs drop constraint if exists programs_application_fee_check;
alter table public.programs drop constraint if exists programs_tuition_fee_check;
alter table public.applications drop constraint if exists applications_application_fee_check;

-- numeric → text, as it was shown: whole amounts without ".00".
do $$
declare
  r record;
begin
  for r in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and data_type = 'numeric'
      and (table_name, column_name) in (
        ('universities', 'application_fee'),
        ('programs', 'application_fee'),
        ('programs', 'tuition_fee'),
        ('applications', 'application_fee')
      )
  loop
    execute format(
      'alter table public.%I alter column %I type text using (case when %2$I is null then null when %2$I = trunc(%2$I) then trunc(%2$I)::text else %2$I::text end)',
      r.table_name, r.column_name
    );
  end loop;
end $$;

-- Not blank (null is "none"), not an essay; the currency still an ISO code.
alter table public.universities add constraint universities_application_fee_check check (
  (application_fee is null or char_length(btrim(application_fee)) between 1 and 120)
  and (application_fee_currency is null or application_fee_currency ~ '^[A-Z]{3}$')
);
alter table public.programs add constraint programs_application_fee_check check (
  (application_fee is null or char_length(btrim(application_fee)) between 1 and 120)
  and (application_fee_currency is null or application_fee_currency ~ '^[A-Z]{3}$')
);
alter table public.programs add constraint programs_tuition_fee_check check (
  tuition_fee is null or char_length(btrim(tuition_fee)) between 1 and 120
);
alter table public.applications add constraint applications_application_fee_check check (
  application_fee is null or char_length(btrim(application_fee)) between 1 and 120
);

comment on column public.universities.application_fee is
  'What applying costs, for every programme that records no fee of its own: an amount ("30", shown in its currency) or words ("Free for EU students", shown as typed) (0287, 0303).';
comment on column public.programs.application_fee is
  'This programme''s own application fee, where it differs from the university''s; an amount or words (0287, 0303).';
comment on column public.programs.tuition_fee is
  'Annual tuition as written: "3000", "€3,000 per year", "Free". suggestPartnerCommission() reads the first amount in it (0263, 0303).';

-- An application's own fee, copied as text from its programme, else its
-- university; its currency as before (0287).
create or replace function public.application_fee_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prog_fee text;
  v_prog_cur text;
  v_uni_fee text;
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

-- The currency fillers read nothing but "is there a fee", so they are as 0287
-- wrote them; only their triggers had to come off for the type change.
create trigger trg_university_fee_currency
  before insert or update of application_fee, application_fee_currency on public.universities
  for each row execute function public.university_fee_currency();
create trigger trg_program_fee_currency
  before insert or update of application_fee, application_fee_currency on public.programs
  for each row execute function public.program_fee_currency();
create trigger trg_application_fee_defaults
  before insert or update of application_fee, application_fee_currency on public.applications
  for each row execute function public.application_fee_defaults();

-- Every column text now, and nothing lost on the way.
do $$
declare
  v_numeric int;
begin
  select count(*) into v_numeric
  from information_schema.columns
  where table_schema = 'public'
    and data_type <> 'text'
    and (table_name, column_name) in (
      ('universities', 'application_fee'),
      ('programs', 'application_fee'),
      ('programs', 'tuition_fee'),
      ('applications', 'application_fee')
    );
  if v_numeric > 0 then
    raise exception '0303: % fee columns are still not text', v_numeric;
  end if;
end $$;

notify pgrst, 'reload schema';
