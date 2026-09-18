-- Move pay off the staff table.
--
-- The gap this closes, measured against production: policy "staff_select"
-- (0006, widened by 0067/0074/0105) permits any of five roles to read EVERY
-- staff row --
--
--   using (id = auth.uid() or has_role(array['super_admin','management',
--          'processing','finance','counselor']))
--
-- -- and RLS has no column dimension: whoever may read the row reads every
-- column on it. A plain counselor could therefore read every colleague's
-- monthly_salary, allowance, commission rates and bonus rate straight from
-- the API. Verified against production before writing this.
--
-- The row itself has to stay broadly readable — the whole app joins to it for
-- names, roles and assignment pickers — so the only way to restrict the pay
-- columns is to put them on a table of their own with its own policy.
--
-- monthly_target deliberately STAYS on staff. It is a registrations target,
-- not compensation: the staff dashboard and both the counselor-performance and
-- monthly-registrations reports show it to Management and counselors already,
-- and moving it would break those three pages for exactly the people they are
-- for. The bonus RATE, which is compensation, moves.

create table if not exists public.staff_compensation (
  staff_id uuid primary key references public.staff (id) on delete cascade,
  monthly_salary numeric(12,2),
  currency text not null default 'PKR',
  allowance numeric(12,2),
  commission_rate_general numeric(12,2),
  commission_rate_public_universities numeric(12,2),
  commission_type_general text not null default 'percentage'
    check (commission_type_general in ('flat', 'percentage')),
  commission_type_public_universities text not null default 'percentage'
    check (commission_type_public_universities in ('flat', 'percentage')),
  bonus_eligible boolean not null default false,
  bonus_rate_percent smallint check (bonus_rate_percent in (25, 50, 75, 100)),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Backfill, then prove it before anything is dropped
-- ---------------------------------------------------------------------------
insert into public.staff_compensation (
  staff_id, monthly_salary, currency, allowance,
  commission_rate_general, commission_rate_public_universities,
  commission_type_general, commission_type_public_universities,
  bonus_eligible, bonus_rate_percent
)
select
  s.id, s.monthly_salary, s.currency, s.allowance,
  s.commission_rate_general, s.commission_rate_public_universities,
  s.commission_type_general, s.commission_type_public_universities,
  s.bonus_eligible, s.bonus_rate_percent
from public.staff s
on conflict (staff_id) do nothing;

-- The DROP below is irreversible, so it does not run unless every row copied
-- across intact. Column by column, nulls included.
do $$
declare
  v_staff int;
  v_comp int;
  v_bad int;
begin
  select count(*) into v_staff from public.staff;
  select count(*) into v_comp from public.staff_compensation;
  if v_staff <> v_comp then
    raise exception 'staff_compensation has % rows for % staff', v_comp, v_staff;
  end if;

  select count(*) into v_bad
  from public.staff s
  join public.staff_compensation k on k.staff_id = s.id
  where s.monthly_salary is distinct from k.monthly_salary
     or s.currency is distinct from k.currency
     or s.allowance is distinct from k.allowance
     or s.commission_rate_general is distinct from k.commission_rate_general
     or s.commission_rate_public_universities is distinct from k.commission_rate_public_universities
     or s.commission_type_general is distinct from k.commission_type_general
     or s.commission_type_public_universities is distinct from k.commission_type_public_universities
     or s.bonus_eligible is distinct from k.bonus_eligible
     or s.bonus_rate_percent is distinct from k.bonus_rate_percent;
  if v_bad > 0 then
    raise exception '% staff rows did not copy across intact', v_bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Who may read pay
-- ---------------------------------------------------------------------------
alter table public.staff_compensation enable row level security;

-- Their own pay, the Super Admin, and Finance — who need every rate to run
-- payroll and the commission ledger. Management is NOT on this list: they
-- assign roles (staff.assign_roles, 0247) and that is the whole point of
-- keeping that permission separate from staff.manage.
drop policy if exists "staff_compensation_select" on public.staff_compensation;
create policy "staff_compensation_select" on public.staff_compensation for select
  using (
    staff_id = auth.uid()
    or is_super_admin()
    or has_role(array['finance']::staff_role[])
  );

-- Setting pay stays exactly where it was: the Super Admin alone, matching the
-- staff.manage permission the staff form is gated on.
drop policy if exists "staff_compensation_write" on public.staff_compensation;
create policy "staff_compensation_write" on public.staff_compensation for all
  using (is_super_admin()) with check (is_super_admin());

revoke all on public.staff_compensation from anon;
grant select, insert, update, delete on public.staff_compensation to authenticated;

-- ---------------------------------------------------------------------------
-- Every staff member has exactly one compensation row
-- ---------------------------------------------------------------------------
-- So the staff form can UPDATE it without first wondering whether it exists,
-- and so a row created by an import or by the service role still gets one.
-- Security definer because a service-role insert into staff runs with no
-- auth.uid(), which the write policy above would refuse.
create or replace function public.staff_ensure_compensation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into staff_compensation (staff_id) values (new.id) on conflict (staff_id) do nothing;
  return new;
end $$;

drop trigger if exists staff_ensure_compensation on public.staff;
create trigger staff_ensure_compensation after insert on public.staff
  for each row execute function public.staff_ensure_compensation();

-- The originals are dropped by 0250, not here. Dropping them in this migration
-- would break the running app the moment it was applied — every deployed page
-- that reads pay still asks staff for those columns. So: apply this, deploy the
-- app that reads staff_compensation, then apply 0250. The leak stays open
-- across that window, which is minutes and under our control; closing it by
-- taking payroll down instead is the worse trade.

notify pgrst, 'reload schema';
