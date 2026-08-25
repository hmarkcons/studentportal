-- HMARK CRM rebuild — step 6: Generate Agreement & Generate Invoice
-- (Module 1A2.3/1A2.4), and the student-facing Agreement Repository (2H) /
-- Payments & Invoices (2F) read access.
-- Run after 0009_students_registration.sql.

create table agreement_templates (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations (id) on delete cascade,
  file_path text not null,
  signatory_name text not null, -- one fixed authorized signatory, never the handling counselor
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_agreement_templates_updated_at on agreement_templates;
create trigger trg_agreement_templates_updated_at
  before update on agreement_templates
  for each row execute function set_updated_at();

alter table destinations
  add constraint destinations_agreement_template_id_fkey
  foreign key (agreement_template_id) references agreement_templates (id);

create table agreements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references leads (id) on delete cascade,
  template_id uuid references agreement_templates (id),
  status text not null default 'draft' check (status in ('draft', 'pending_signature', 'signed')),
  signing_method text check (signing_method in ('paper', 'e_signature')),
  video_recording_path text, -- mandatory for e-signature (outside Karachi)
  email_verified boolean not null default false,
  signed_file_path text,
  version int not null default 1,
  admin_charge_override numeric(10, 2),
  consultancy_fee_override numeric(12, 2),
  generated_by uuid references staff (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_agreements_updated_at on agreements;
create trigger trg_agreements_updated_at
  before update on agreements
  for each row execute function set_updated_at();

-- Flip the student's portal_active gate once their agreement is signed &
-- uploaded (the doc's mandatory login gate: "account stays inactive until
-- it's uploaded").
create or replace function activate_student_portal_on_signed_agreement() returns trigger
language plpgsql security definer as $$
begin
  if new.status = 'signed' and new.signed_file_path is not null then
    update leads set portal_active = true where id = new.student_id and portal_active = false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activate_student_portal on agreements;
create trigger trg_activate_student_portal
  after insert or update on agreements
  for each row execute function activate_student_portal_on_signed_agreement();

create table invoices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references leads (id) on delete cascade,
  agreement_id uuid references agreements (id),
  admin_charge numeric(10, 2) not null default 0,
  consultancy_fee numeric(12, 2) not null default 0,
  currency text not null default 'EUR',
  generated_by uuid references staff (id),
  sent_status text not null default 'unsent' check (sent_status in ('unsent', 'sent')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_invoices_updated_at on invoices;
create trigger trg_invoices_updated_at
  before update on invoices
  for each row execute function set_updated_at();

create table invoice_installments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  installment_no int not null,
  amount numeric(12, 2) not null,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'partial')),
  due_date date,
  paid_date date,
  payment_proof_path text,
  unique (invoice_id, installment_no)
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  sent_status text not null default 'unsent' check (sent_status in ('unsent', 'sent')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table agreement_templates enable row level security;
alter table agreements enable row level security;
alter table invoices enable row level security;
alter table invoice_installments enable row level security;
alter table receipts enable row level security;

create policy "agreement_templates_select" on agreement_templates for select using (is_active_staff());
create policy "agreement_templates_write" on agreement_templates for all
  using (is_active_staff()) with check (is_active_staff());

-- Agreements: any staff role can generate/send (per doc); students read-only.
create policy "agreements_select" on agreements for select
  using (staff_can_view_student(student_id) or is_own_student(student_id));
create policy "agreements_write" on agreements for all
  using (is_active_staff()) with check (is_active_staff());

-- Invoices/installments/receipts: Finance (+ Super Admin) generate/manage;
-- students get read-only access to their own fee breakdown.
create policy "invoices_select" on invoices for select
  using (staff_can_view_student(student_id) or is_own_student(student_id));
create policy "invoices_write" on invoices for all
  using (has_role(array['finance', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'super_admin']::staff_role[]));

create policy "invoice_installments_select" on invoice_installments for select
  using (exists (
    select 1 from invoices i
    where i.id = invoice_installments.invoice_id
      and (staff_can_view_student(i.student_id) or is_own_student(i.student_id))
  ));
create policy "invoice_installments_write" on invoice_installments for all
  using (has_role(array['finance', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'super_admin']::staff_role[]));

create policy "receipts_select" on receipts for select
  using (exists (
    select 1 from invoices i
    where i.id = receipts.invoice_id
      and (staff_can_view_student(i.student_id) or is_own_student(i.student_id))
  ));
create policy "receipts_write" on receipts for all
  using (has_role(array['finance', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'super_admin']::staff_role[]));
