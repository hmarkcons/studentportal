-- Consultancy Fee module: admin-fee tracked separately from consultancy
-- installments, a staff-managed fee/product catalog, extra line items on an
-- invoice beyond the fixed admin+consultancy fields, and an email log for
-- invoice sends / overdue reminders.

alter table invoices
  add column if not exists admin_fee_status text not null default 'unpaid' check (admin_fee_status in ('unpaid', 'paid')),
  add column if not exists admin_fee_paid_date date,
  add column if not exists admin_fee_payment_method text,
  add column if not exists last_reminder_sent_at timestamptz;

create table if not exists fee_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_amount numeric(12, 2),
  default_currency text not null default 'EUR',
  created_by uuid references staff (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_fee_products_updated_at on fee_products;
create trigger trg_fee_products_updated_at
  before update on fee_products
  for each row execute function set_updated_at();

create table if not exists invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  product_id uuid references fee_products (id),
  name text not null,
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create table if not exists invoice_email_log (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  kind text not null check (kind in ('invoice', 'overdue_reminder')),
  sent_to text,
  status text not null check (status in ('sent', 'failed')),
  error text,
  sent_by uuid references staff (id),
  created_at timestamptz not null default now()
);

alter table fee_products enable row level security;
alter table invoice_line_items enable row level security;
alter table invoice_email_log enable row level security;

create policy "fee_products_select" on fee_products for select using (is_active_staff());
create policy "fee_products_write" on fee_products for all
  using (has_role(array['super_admin', 'finance']::staff_role[]))
  with check (has_role(array['super_admin', 'finance']::staff_role[]));

create policy "invoice_line_items_select" on invoice_line_items for select
  using (
    staff_can_view_student((select student_id from invoices where id = invoice_line_items.invoice_id))
    or has_role(array['finance', 'management', 'super_admin', 'processing']::staff_role[])
  );
create policy "invoice_line_items_write" on invoice_line_items for all
  using (has_role(array['super_admin', 'finance', 'processing']::staff_role[]))
  with check (has_role(array['super_admin', 'finance', 'processing']::staff_role[]));

create policy "invoice_email_log_select" on invoice_email_log for select
  using (has_role(array['finance', 'management', 'super_admin', 'processing']::staff_role[]));
create policy "invoice_email_log_write" on invoice_email_log for insert
  with check (has_role(array['finance', 'super_admin', 'processing']::staff_role[]));

-- Widen invoice/installment write access to include processing, per the
-- Consultancy Fee module's role requirement (super_admin, finance,
-- processing can edit/delete/view); previously finance/super_admin only.
drop policy if exists "invoices_write" on invoices;
create policy "invoices_write" on invoices for all
  using (has_role(array['finance', 'super_admin', 'processing']::staff_role[]))
  with check (has_role(array['finance', 'super_admin', 'processing']::staff_role[]));

drop policy if exists "invoice_installments_write" on invoice_installments;
create policy "invoice_installments_write" on invoice_installments for all
  using (has_role(array['finance', 'super_admin', 'processing']::staff_role[]))
  with check (has_role(array['finance', 'super_admin', 'processing']::staff_role[]));
