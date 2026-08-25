-- HMARK CRM rebuild — step 23: QR code check-in (Module 1M) — "a fixed QR
-- code posted at the office; staff scan it on arrival to confirm physical
-- presence, tied to their account." Biometric stays out of scope (hardware
-- purchase pending, per the doc).
-- Run after 0026_student_catalog_access.sql.

-- Singleton row (id is always `true`) holding the current office QR token.
-- Super Admin can rotate it (e.g. if the printed sheet is lost/compromised)
-- without a schema change.
create table office_qr_tokens (
  id boolean primary key default true,
  token uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  constraint office_qr_tokens_singleton check (id)
);

insert into office_qr_tokens (id) values (true) on conflict do nothing;

alter table office_qr_tokens enable row level security;

create policy "office_qr_tokens_select" on office_qr_tokens for select
  using (is_active_staff());
create policy "office_qr_tokens_update" on office_qr_tokens for update
  using (has_role(array['super_admin']::staff_role[]))
  with check (has_role(array['super_admin']::staff_role[]));
