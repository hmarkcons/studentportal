-- AEO Pakistan: the commission HMARK is owed for each IELTS registration it
-- made at AEO Pakistan (0335). Accounts & Finance › AEO Pakistan.
--
-- One row per registration, as the office's own sheet keeps them: Sr. #, the
-- candidate's name, the challan number, the challan's date, the test (one text
-- cell, as typed: "(06/08/2022) ( ACADEMIC ) ( Computer Based ) ( IELTS (IOC) )"),
-- the commission and whether AEO has paid it — with, once paid, the date and
-- the payment's reference.
--
-- A challan number is one registration, so it is unique, and it is what an
-- import matches on: the same challan updates its row, a new one is added.
--
-- Only a Super Admin and the Finance role (the account officer) see or touch
-- any of it, and that is fixed: the table's policies name the two roles, not
-- a permission, and page.finance.aeo_pakistan — which puts the page in the
-- menu — cannot be granted to anyone else (the override tables refuse it, as
-- they refuse staff.manage, 0284).

begin;

do $$
begin
  if to_regprocedure('public.has_role(staff_role[])') is null or to_regprocedure('public.log_audit_event()') is null then
    raise exception '0335: has_role or log_audit_event is missing';
  end if;
  if to_regclass('public.permission_definitions') is null then
    raise exception '0335: permission_definitions is missing';
  end if;
end $$;

-- 1 ------------------------------------------------------------ the table
create table public.aeo_ielts_commissions (
  id uuid primary key default gen_random_uuid(),
  sr_no integer check (sr_no is null or sr_no > 0),
  candidate_name text not null check (length(btrim(candidate_name)) between 1 and 200),
  challan_number text not null check (length(btrim(challan_number)) between 1 and 60),
  challan_date date,
  test_details text check (test_details is null or length(test_details) <= 500),
  commission_amount numeric(12, 2) not null default 0 check (commission_amount >= 0),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  paid_on date,
  payment_reference text check (payment_reference is null or length(payment_reference) <= 120),
  notes text check (notes is null or length(notes) <= 1000),
  created_by uuid default auth.uid() references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.staff (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- A payment's date and reference belong to a paid commission; marking one
  -- unpaid again takes them off.
  constraint aeo_ielts_commissions_paid_details check (payment_status = 'paid' or (paid_on is null and payment_reference is null))
);

-- "085456" and " 85456" are not two challans.
create unique index aeo_ielts_commissions_challan on public.aeo_ielts_commissions (lower(btrim(challan_number)));
create index aeo_ielts_commissions_challan_date on public.aeo_ielts_commissions (challan_date);

comment on table public.aeo_ielts_commissions is
  'Commission owed by AEO Pakistan for each IELTS registration (0335). Super Admin and Finance only.';

-- Who last changed a row, and when.
create or replace function public.aeo_ielts_commissions_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger trg_aeo_ielts_commissions_stamp
  before insert or update on public.aeo_ielts_commissions
  for each row execute function public.aeo_ielts_commissions_stamp();

-- 2 ---------------------------------------------------------- who reads it
alter table public.aeo_ielts_commissions enable row level security;

create policy aeo_ielts_commissions_select on public.aeo_ielts_commissions
  for select to authenticated using ((select public.has_role(array['super_admin', 'finance']::staff_role[])));
create policy aeo_ielts_commissions_insert on public.aeo_ielts_commissions
  for insert to authenticated with check ((select public.has_role(array['super_admin', 'finance']::staff_role[])));
create policy aeo_ielts_commissions_update on public.aeo_ielts_commissions
  for update to authenticated
  using ((select public.has_role(array['super_admin', 'finance']::staff_role[])))
  with check ((select public.has_role(array['super_admin', 'finance']::staff_role[])));
create policy aeo_ielts_commissions_delete on public.aeo_ielts_commissions
  for delete to authenticated using ((select public.has_role(array['super_admin', 'finance']::staff_role[])));

revoke all on public.aeo_ielts_commissions from anon;
grant select, insert, update, delete on public.aeo_ielts_commissions to authenticated;

-- 3 ------------------------------------------------------------ its history
-- So a deleted record can be restored and an edit reverted (0322).
create trigger trg_audit_aeo_ielts_commissions
  after insert or update or delete on public.aeo_ielts_commissions
  for each row execute function public.log_audit_event('id');

-- 4 -------------------------------------------------------------- the page
insert into public.permission_definitions (key, category, label, description, default_roles, sort_order) values
  ('page.finance.aeo_pakistan', 'Menu & page access', 'Open AEO Pakistan', 'See Accounts & Finance › AEO Pakistan, the IELTS commission record. Super Admin and Finance only; not grantable.', array['finance']::staff_role[], 136)
on conflict (key) do update set default_roles = excluded.default_roles, description = excluded.description;

-- Fixed to Finance: no override may switch it on, or off, for anyone else.
delete from public.role_permission_overrides where permission_key = 'page.finance.aeo_pakistan';
delete from public.staff_permission_overrides where permission_key = 'page.finance.aeo_pakistan';
alter table public.role_permission_overrides
  add constraint role_permission_overrides_aeo_pakistan_fixed check (permission_key <> 'page.finance.aeo_pakistan');
alter table public.staff_permission_overrides
  add constraint staff_permission_overrides_aeo_pakistan_fixed check (permission_key <> 'page.finance.aeo_pakistan');

commit;
