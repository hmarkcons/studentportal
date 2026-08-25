-- HMARK CRM rebuild — step 9: Finance & Commission Management (Module 1H).
-- Run after 0012_country_trackers_scholarships_credentials.sql.

create table staff_commissions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff (id),
  student_id uuid not null references leads (id) on delete cascade,
  registration_date date,
  amount numeric(12, 2) not null,
  currency text not null default 'PKR',
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  payment_proof_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_staff_commissions_updated_at on staff_commissions;
create trigger trg_staff_commissions_updated_at
  before update on staff_commissions
  for each row execute function set_updated_at();

drop trigger if exists trg_audit_staff_commissions on staff_commissions;
create trigger trg_audit_staff_commissions
  after insert or update or delete on staff_commissions
  for each row execute function log_audit_event();

create table partner_commissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references leads (id) on delete cascade,
  application_id uuid references applications (id),
  paid_fee numeric(12, 2),
  fee_payment_date date,
  rate_percent numeric(5, 2),
  fixed_amount numeric(12, 2),
  currency text not null default 'EUR',
  expected_amount numeric(12, 2),
  channel text check (channel in ('wallet', 'direct')),
  wallet_platform text,
  received_date date,
  hmark_bank_account text,
  payment_proof_path text,
  status text not null default 'not_yet_due' check (
    status in ('not_yet_due', 'pending', 'received', 'partially_received', 'overdue', 'disputed')
  ),
  assigned_counselor_id uuid references staff (id),
  reconciliation_flag boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_partner_commissions_updated_at on partner_commissions;
create trigger trg_partner_commissions_updated_at
  before update on partner_commissions
  for each row execute function set_updated_at();

create table refund_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references leads (id) on delete cascade,
  application_id uuid references applications (id),
  reason text,
  amount numeric(12, 2),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'processed')),
  requested_by uuid references staff (id),
  requested_at timestamptz not null default now(),
  approved_by uuid references staff (id),
  approved_at timestamptz,
  processed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table staff_commissions enable row level security;
alter table partner_commissions enable row level security;
alter table refund_requests enable row level security;

-- Staff see only their own commission rows; Finance/Super Admin see all and
-- are the only ones who can mark a commission paid / upload proof.
create policy "staff_commissions_select" on staff_commissions for select
  using (staff_id = auth.uid() or has_role(array['finance', 'super_admin']::staff_role[]));
create policy "staff_commissions_write" on staff_commissions for all
  using (has_role(array['finance', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'super_admin']::staff_role[]));

create policy "partner_commissions_select" on partner_commissions for select
  using (staff_can_view_student(student_id) or has_role(array['finance', 'management', 'super_admin']::staff_role[]));
create policy "partner_commissions_write" on partner_commissions for all
  using (has_role(array['finance', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'super_admin']::staff_role[]));

-- Refund workflow: any staff who can see the student may raise a request;
-- only Management/Super Admin/Finance approve or mark it processed.
create policy "refund_requests_select" on refund_requests for select
  using (staff_can_view_student(student_id) or has_role(array['finance', 'management', 'super_admin']::staff_role[]));
create policy "refund_requests_insert" on refund_requests for insert
  with check (staff_can_view_student(student_id));
create policy "refund_requests_update" on refund_requests for update
  using (has_role(array['finance', 'management', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'management', 'super_admin']::staff_role[]));
