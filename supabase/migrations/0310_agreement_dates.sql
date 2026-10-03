-- The date an agreement carries, chosen by staff rather than taken from the
-- moment it was generated.
--
-- A student's agreement and a staff member's agreement both printed the day
-- the row was created. The office backdates an agreement to the day it was
-- actually agreed, or dates it for a signing appointment, so the date is now
-- a field of its own:
--
--   agreements.agreement_date         the date on a student's agreement
--   staff_agreements.agreement_date   the date on a staff agreement
--
-- Chosen when the agreement is generated (today, in Karachi, unless staff pick
-- another) and changeable afterwards at any time, signed or not — the office's
-- decision. Changing it rebuilds the generated PDF; a copy already signed and
-- returned is a document of its own and keeps the date it was signed with.
--
-- Existing agreements take the day they were created, in Karachi — what they
-- were meant to print. Any date is allowed, within a range that catches a
-- mistyped year.
--
-- Who may change it is who may already update the row: the existing update
-- policies (agreements_update, 0041; staff_agreements_write, 0271) are
-- untouched, and neither a student nor a staff member can write their own.

do $$
begin
  if to_regclass('public.agreements') is null or to_regclass('public.staff_agreements') is null then
    raise exception '0310: agreements or staff_agreements is missing';
  end if;
end $$;

alter table public.agreements add column if not exists agreement_date date;
update public.agreements set agreement_date = (created_at at time zone 'Asia/Karachi')::date where agreement_date is null;
alter table public.agreements
  alter column agreement_date set default ((now() at time zone 'Asia/Karachi')::date),
  alter column agreement_date set not null;
alter table public.agreements drop constraint if exists agreements_agreement_date_sane;
alter table public.agreements
  add constraint agreements_agreement_date_sane check (agreement_date between date '2000-01-01' and date '2100-12-31');

alter table public.staff_agreements add column if not exists agreement_date date;
update public.staff_agreements set agreement_date = (created_at at time zone 'Asia/Karachi')::date where agreement_date is null;
alter table public.staff_agreements
  alter column agreement_date set default ((now() at time zone 'Asia/Karachi')::date),
  alter column agreement_date set not null;
alter table public.staff_agreements drop constraint if exists staff_agreements_agreement_date_sane;
alter table public.staff_agreements
  add constraint staff_agreements_agreement_date_sane check (agreement_date between date '2000-01-01' and date '2100-12-31');
