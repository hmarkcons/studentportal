-- Per-staff, per-month payroll records (Payroll - Staff page under HR).
create table staff_payroll (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff (id) on delete cascade,
  payroll_month date not null, -- always the 1st of the month
  basic_salary numeric(12, 2) not null default 0,
  allowances numeric(12, 2) not null default 0,
  total_commission numeric(12, 2) not null default 0,
  overtime numeric(12, 2) not null default 0,
  deduction_absent numeric(12, 2) not null default 0,
  deduction_late numeric(12, 2) not null default 0,
  deduction_other numeric(12, 2) not null default 0,
  tax numeric(12, 2) not null default 0,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'processed', 'paid', 'failed')),
  updated_by uuid references staff (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, payroll_month)
);

drop trigger if exists trg_staff_payroll_updated_at on staff_payroll;
create trigger trg_staff_payroll_updated_at
  before update on staff_payroll
  for each row execute function set_updated_at();

alter table staff_payroll enable row level security;

create policy "staff_payroll_select" on staff_payroll for select using (is_active_staff());
create policy "staff_payroll_write" on staff_payroll for all
  using (has_role(array['super_admin', 'finance']::staff_role[]))
  with check (has_role(array['super_admin', 'finance']::staff_role[]));
