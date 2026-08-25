-- HMARK CRM rebuild — step 12: Partner University Portal (Module 3).
-- Run after 0015_marketing.sql.

create type partner_account_status as enum ('pending', 'active', 'suspended');

create table partner_university_accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  university_id uuid not null references universities (id) on delete cascade,
  staff_name text not null,
  role_title text,
  status partner_account_status not null default 'pending', -- self-registration starts pending HMARK approval
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_partner_university_accounts_updated_at on partner_university_accounts;
create trigger trg_partner_university_accounts_updated_at
  before update on partner_university_accounts
  for each row execute function set_updated_at();

create or replace function partner_university_id() returns uuid
language sql security definer stable as $$
  select university_id from partner_university_accounts where id = auth.uid() and status = 'active';
$$;

-- Configurable per-partnership visibility: full profile & documents, or a
-- name/program/document-status summary only (per Module 3B).
alter table universities
  add column student_visibility_mode text not null default 'summary'
  check (student_visibility_mode in ('full', 'summary'));

create table partner_agreements (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null unique references universities (id) on delete cascade,
  file_path text not null,
  commission_terms jsonb not null default '{}'::jsonb,
  expiry_date date,
  uploaded_by uuid references staff (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_partner_agreements_updated_at on partner_agreements;
create trigger trg_partner_agreements_updated_at
  before update on partner_agreements
  for each row execute function set_updated_at();

-- Document Exchange (Module 3C) — university-provided templates/brochures
-- shared with HMARK, grouped either by student or by intake/semester batch.
create table partner_document_exchange (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities (id) on delete cascade,
  file_path text not null,
  description text,
  grouping text check (grouping in ('by_student', 'by_intake')),
  student_id uuid references leads (id),
  intake_label text,
  uploaded_by_partner uuid references partner_university_accounts (id),
  uploaded_by_staff uuid references staff (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Read surface for "summary" mode: a security-definer function so a
-- summary-mode partner never touches the raw applications/leads tables
-- directly (only "full" mode gets a real RLS-granted SELECT below).
-- ---------------------------------------------------------------------------

create or replace function get_partner_applications() returns table (
  application_id uuid,
  student_name text,
  program_name text,
  intake text,
  current_stage text,
  submitted_at timestamptz,
  student_email text,
  student_phone text,
  documents_summary jsonb
) language plpgsql security definer as $$
declare
  v_uni uuid;
  v_mode text;
begin
  v_uni := partner_university_id();
  if v_uni is null then
    return;
  end if;
  select u.student_visibility_mode into v_mode from universities u where u.id = v_uni;

  return query
  select
    a.id,
    l.full_name,
    p.name,
    a.intake,
    a.current_stage,
    a.created_at,
    case when v_mode = 'full' then l.email else null end,
    case when v_mode = 'full' then l.contact_number else null end,
    (
      select jsonb_object_agg(coalesce(sd.category, 'other'), sd.status)
      from student_documents sd
      where sd.application_id = a.id
    )
  from applications a
  join leads l on l.id = a.student_id
  left join programs p on p.id = a.program_id
  where a.university_id = v_uni;
end;
$$;

grant execute on function get_partner_applications() to authenticated;

-- ---------------------------------------------------------------------------
-- A partner may update an application's current_stage only — never
-- reassign it to a different student/university/program. Enforced with a
-- trigger since RLS can't compare OLD vs NEW columns directly.
-- ---------------------------------------------------------------------------

create or replace function restrict_partner_application_updates() returns trigger
language plpgsql as $$
declare
  v_partner_uni uuid;
begin
  v_partner_uni := partner_university_id();
  if v_partner_uni is not null and v_partner_uni = old.university_id then
    if new.student_id is distinct from old.student_id
      or new.university_id is distinct from old.university_id
      or new.program_id is distinct from old.program_id
      or new.preenrollment_finalized is distinct from old.preenrollment_finalized
    then
      raise exception 'Partner university accounts may only update current_stage';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restrict_partner_application_updates on applications;
create trigger trg_restrict_partner_application_updates
  before update on applications
  for each row execute function restrict_partner_application_updates();

-- Same guard for commission rows: a partner may update payment/dispute
-- fields only, never the computed amounts or who it's attributed to.
create or replace function restrict_partner_commission_updates() returns trigger
language plpgsql as $$
declare
  v_partner_uni uuid;
  v_app_uni uuid;
begin
  v_partner_uni := partner_university_id();
  if v_partner_uni is null then
    return new;
  end if;
  select university_id into v_app_uni from applications where id = old.application_id;
  if v_app_uni = v_partner_uni then
    if new.paid_fee is distinct from old.paid_fee
      or new.rate_percent is distinct from old.rate_percent
      or new.fixed_amount is distinct from old.fixed_amount
      or new.expected_amount is distinct from old.expected_amount
      or new.assigned_counselor_id is distinct from old.assigned_counselor_id
      or new.currency is distinct from old.currency
      or new.student_id is distinct from old.student_id
      or new.application_id is distinct from old.application_id
    then
      raise exception 'Partner university accounts may only update payment/dispute fields';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restrict_partner_commission_updates on partner_commissions;
create trigger trg_restrict_partner_commission_updates
  before update on partner_commissions
  for each row execute function restrict_partner_commission_updates();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table partner_university_accounts enable row level security;
alter table partner_agreements enable row level security;
alter table partner_document_exchange enable row level security;

create policy "partner_university_accounts_select" on partner_university_accounts for select
  using (id = auth.uid() or has_role(array['super_admin', 'management']::staff_role[]));
create policy "partner_university_accounts_insert_self" on partner_university_accounts for insert
  with check (id = auth.uid());
create policy "partner_university_accounts_insert_staff" on partner_university_accounts for insert
  with check (has_role(array['super_admin', 'management']::staff_role[]));
create policy "partner_university_accounts_update" on partner_university_accounts for update
  using (id = auth.uid() or has_role(array['super_admin', 'management']::staff_role[]))
  with check (id = auth.uid() or has_role(array['super_admin', 'management']::staff_role[]));
create policy "partner_university_accounts_delete" on partner_university_accounts for delete
  using (has_role(array['super_admin', 'management']::staff_role[]));

create policy "partner_agreements_select" on partner_agreements for select
  using (is_active_staff() or university_id = partner_university_id());
create policy "partner_agreements_write" on partner_agreements for all
  using (has_role(array['super_admin', 'management']::staff_role[]))
  with check (has_role(array['super_admin', 'management']::staff_role[]));

create policy "partner_document_exchange_select" on partner_document_exchange for select
  using (university_id = partner_university_id() or has_role(array['processing', 'super_admin']::staff_role[]));
create policy "partner_document_exchange_insert_partner" on partner_document_exchange for insert
  with check (university_id = partner_university_id() and uploaded_by_partner = auth.uid());
create policy "partner_document_exchange_insert_staff" on partner_document_exchange for insert
  with check (has_role(array['processing', 'super_admin']::staff_role[]) and uploaded_by_staff = auth.uid());

-- Applications: full-mode partners get a direct, filtered SELECT; every
-- partner (regardless of mode) can update current_stage via the trigger above.
create policy "applications_select_partner_full" on applications for select
  using (
    university_id = partner_university_id()
    and exists (
      select 1 from universities u where u.id = applications.university_id and u.student_visibility_mode = 'full'
    )
  );
create policy "applications_update_partner" on applications for update
  using (university_id = partner_university_id())
  with check (university_id = partner_university_id());

-- Documents: full-mode partners can view; any partner can upload official
-- documents (offer/rejection letters) against an application in their own university.
create policy "student_documents_select_partner_full" on student_documents for select
  using (exists (
    select 1 from applications a
    join universities u on u.id = a.university_id
    where a.id = student_documents.application_id
      and u.id = partner_university_id()
      and u.student_visibility_mode = 'full'
  ));
create policy "student_documents_insert_partner" on student_documents for insert
  with check (
    category in ('offer_letter', 'rejection_letter')
    and exists (select 1 from applications a where a.id = student_documents.application_id and a.university_id = partner_university_id())
  );

-- Commission: full transparency for the partner's own university, regardless of mode.
create policy "partner_commissions_select_partner" on partner_commissions for select
  using (exists (select 1 from applications a where a.id = partner_commissions.application_id and a.university_id = partner_university_id()));
create policy "partner_commissions_update_partner" on partner_commissions for update
  using (exists (select 1 from applications a where a.id = partner_commissions.application_id and a.university_id = partner_university_id()))
  with check (exists (select 1 from applications a where a.id = partner_commissions.application_id and a.university_id = partner_university_id()));

-- Messages: partner reads/sends on their own university's thread.
create policy "messages_select_partner" on messages for select
  using (entity_type = 'university' and entity_id = partner_university_id());
create policy "messages_insert_partner" on messages for insert
  with check (entity_type = 'university' and entity_id = partner_university_id());
