-- HMARK CRM rebuild — step 13: Staff Attendance Tracking (Module 1M) and
-- Additional Services (Module 1O).
-- Run after 0016_partner_portal.sql.

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff (id) on delete cascade,
  work_date date not null default current_date,
  clock_in timestamptz,
  clock_out timestamptz,
  method text not null default 'button' check (method in ('button', 'qr', 'biometric')),
  ip_address text,
  late_flag boolean not null default false,
  created_at timestamptz not null default now()
);

create index attendance_records_staff_idx on attendance_records (staff_id, work_date);

-- Additional Services (Module 1O) — 9 sub-categories share one standard
-- shape (per the doc), with a jsonb column absorbing the handful of extra
-- columns each service type adds (see plan decision #6).
create type additional_service_type as enum (
  'ibcc_attestation', 'hec_attestation', 'apostille', 'mofa_attestation',
  'family_income_certificate', 'property_certificate', 'affidavits',
  'cimea_payment', 'visa_appointments'
);

create table additional_service_requests (
  id uuid primary key default gen_random_uuid(),
  service_type additional_service_type not null,
  student_id uuid not null references leads (id) on delete cascade,
  passport_number text,
  country_applying_to text,
  documents_submission_date date,
  required_document_names text[] not null default '{}',
  documents_received boolean not null default false,
  pending_documents text[] not null default '{}',
  total_fee_paid numeric(12, 2),
  fee_receiving_date date,
  proof_of_payment_path text,
  delivery_date date,
  extra_fields jsonb not null default '{}'::jsonb,
  created_by uuid references staff (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_additional_service_requests_updated_at on additional_service_requests;
create trigger trg_additional_service_requests_updated_at
  before update on additional_service_requests
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table attendance_records enable row level security;
alter table additional_service_requests enable row level security;

create policy "attendance_records_select" on attendance_records for select
  using (staff_id = auth.uid() or has_role(array['super_admin', 'management']::staff_role[]));
create policy "attendance_records_insert" on attendance_records for insert
  with check (staff_id = auth.uid() or has_role(array['super_admin']::staff_role[]));
create policy "attendance_records_update_own" on attendance_records for update
  using (staff_id = auth.uid())
  with check (staff_id = auth.uid());

-- Accessible only to Super Admin and the Processing Officer, per the doc.
create policy "additional_service_requests_select" on additional_service_requests for select
  using (has_role(array['processing', 'super_admin']::staff_role[]));
create policy "additional_service_requests_write" on additional_service_requests for all
  using (has_role(array['processing', 'super_admin']::staff_role[]))
  with check (has_role(array['processing', 'super_admin']::staff_role[]));
