-- HMARK CRM rebuild — step 7: Application Processing Workflow (Module 1D),
-- Document Management (Module 1E), and Visa Management (Module 1F).
-- Run after 0010_agreements_invoices.sql.

-- ---------------------------------------------------------------------------
-- Applications: one row per student x university x program. current_stage
-- is free text, validated against the owning destination's configurable
-- pipeline_stages (a static check constraint can't do this since it varies
-- per destination — see plan decision #3).
-- ---------------------------------------------------------------------------

create table applications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references leads (id) on delete cascade,
  university_id uuid not null references universities (id),
  program_id uuid references programs (id),
  intake text,
  current_stage text not null,
  preenrollment_finalized boolean not null default false, -- Italy scholarship visibility gate (0012)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, university_id, program_id)
);

create index applications_student_idx on applications (student_id);
create index applications_university_idx on applications (university_id);

drop trigger if exists trg_applications_updated_at on applications;
create trigger trg_applications_updated_at
  before update on applications
  for each row execute function set_updated_at();

create or replace function validate_application_stage() returns trigger
language plpgsql as $$
declare
  dest_id uuid;
  allowed jsonb;
begin
  select u.destination_id into dest_id from universities u where u.id = new.university_id;
  select d.pipeline_stages into allowed from destinations d where d.id = dest_id;

  if new.current_stage is null then
    new.current_stage := allowed ->> 0;
  end if;

  -- Rejected/Declined/Withdrawn are always reachable manual statuses,
  -- regardless of a destination's custom pipeline (per the doc).
  if new.current_stage not in ('rejected', 'declined', 'withdrawn') and not (allowed ? new.current_stage) then
    raise exception 'Stage "%" is not part of this destination''s configured pipeline', new.current_stage;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_application_stage on applications;
create trigger trg_validate_application_stage
  before insert or update on applications
  for each row execute function validate_application_stage();

create table application_stage_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  stage text not null,
  entered_at timestamptz not null default now(),
  changed_by uuid references staff (id),
  change_type text not null default 'manual' check (change_type in ('automatic', 'manual'))
);

create or replace function log_application_stage_change() returns trigger
language plpgsql security definer as $$
begin
  if (tg_op = 'INSERT') or (new.current_stage is distinct from old.current_stage) then
    insert into application_stage_history (application_id, stage, changed_by, change_type)
    values (new.id, new.current_stage, auth.uid(), case when tg_op = 'INSERT' then 'automatic' else 'manual' end);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_application_stage_change on applications;
create trigger trg_log_application_stage_change
  after insert or update on applications
  for each row execute function log_application_stage_change();

create table application_tasks (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  stage text,
  description text not null,
  owner_id uuid references staff (id),
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_application_tasks_updated_at on application_tasks;
create trigger trg_application_tasks_updated_at
  before update on application_tasks
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Document Management (Module 1E) — templates are reference data (level x
-- destination x category); student_documents are the per-student instances.
-- ---------------------------------------------------------------------------

create table document_templates (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'all' check (level in ('bachelors', 'masters', 'phd', 'all')),
  destination_id uuid references destinations (id), -- null = applies to every destination
  category text not null check (category in (
    'admission', 'interview', 'attestation', 'visa', 'scholarship',
    'scholarship_documents', 'italian_translations', 'visa_sticker', 'travel', 'enrollment', 'other'
  )),
  name text not null,
  description text,
  sample_file_path text,
  required boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table student_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references leads (id) on delete cascade,
  application_id uuid references applications (id) on delete cascade, -- null for student-level docs (passport, CV, ...)
  template_id uuid references document_templates (id),
  category text,
  status text not null default 'missing' check (
    status in ('missing', 'submitted', 'under_review', 'verified', 'rejected')
  ),
  file_path text,
  version int not null default 1,
  deadline date,
  glare_flagged boolean not null default false,
  uploaded_by_role text check (uploaded_by_role in ('student', 'staff')),
  uploaded_at timestamptz,
  verified_by uuid references staff (id),
  verified_at timestamptz,
  rejected_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index student_documents_student_idx on student_documents (student_id);
create index student_documents_application_idx on student_documents (application_id);

drop trigger if exists trg_student_documents_updated_at on student_documents;
create trigger trg_student_documents_updated_at
  before update on student_documents
  for each row execute function set_updated_at();

drop trigger if exists trg_audit_student_documents on student_documents;
create trigger trg_audit_student_documents
  after update on student_documents
  for each row
  when (old.status is distinct from new.status and new.status in ('verified', 'rejected'))
  execute function log_audit_event();

-- ---------------------------------------------------------------------------
-- Visa Management (Module 1F) — outcome auto-syncs to the application's
-- stage tracker when the destination's pipeline includes a 'visa_granted' stage.
-- ---------------------------------------------------------------------------

create table visa_records (
  application_id uuid primary key references applications (id) on delete cascade,
  biometric_appointment timestamptz,
  interview_appointment timestamptz,
  medical_appointment timestamptz,
  outcome text not null default 'pending' check (outcome in ('pending', 'approved', 'rejected', 'rfe')),
  outcome_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_visa_records_updated_at on visa_records;
create trigger trg_visa_records_updated_at
  before update on visa_records
  for each row execute function set_updated_at();

create or replace function sync_visa_outcome_to_application() returns trigger
language plpgsql security definer as $$
declare
  allowed jsonb;
begin
  if new.outcome = 'approved' and (old.outcome is distinct from new.outcome) then
    select d.pipeline_stages into allowed
    from applications a
    join universities u on u.id = a.university_id
    join destinations d on d.id = u.destination_id
    where a.id = new.application_id;

    if allowed ? 'visa_granted' then
      update applications set current_stage = 'visa_granted' where id = new.application_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_visa_outcome on visa_records;
create trigger trg_sync_visa_outcome
  after update on visa_records
  for each row execute function sync_visa_outcome_to_application();

-- ---------------------------------------------------------------------------
-- Storage: re-scope the 'documents' bucket (kept from the old schema) to
-- the new applications/leads shape. Files live at "<student_id>/<filename>".
-- ---------------------------------------------------------------------------

create policy "documents_storage_staff" on storage.objects for all
  using (bucket_id = 'documents' and staff_can_view_student(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'documents' and staff_can_view_student(((storage.foldername(name))[1])::uuid));

create policy "documents_storage_select_self" on storage.objects for select
  using (bucket_id = 'documents' and is_own_student(((storage.foldername(name))[1])::uuid));

create policy "documents_storage_insert_self" on storage.objects for insert
  with check (bucket_id = 'documents' and is_own_student(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table applications enable row level security;
alter table application_stage_history enable row level security;
alter table application_tasks enable row level security;
alter table document_templates enable row level security;
alter table student_documents enable row level security;
alter table visa_records enable row level security;

create policy "applications_select" on applications for select
  using (staff_can_view_student(student_id) or is_own_student(student_id));
create policy "applications_insert" on applications for insert
  with check (staff_can_view_student(student_id));
create policy "applications_update" on applications for update
  using (staff_can_view_student(student_id)) with check (staff_can_view_student(student_id));
create policy "applications_delete" on applications for delete
  using (has_role(array['management', 'super_admin']::staff_role[]));

create policy "application_stage_history_select" on application_stage_history for select
  using (exists (
    select 1 from applications a where a.id = application_stage_history.application_id
      and (staff_can_view_student(a.student_id) or is_own_student(a.student_id))
  ));

create policy "application_tasks_select" on application_tasks for select
  using (exists (
    select 1 from applications a where a.id = application_tasks.application_id
      and (staff_can_view_student(a.student_id) or is_own_student(a.student_id))
  ));
create policy "application_tasks_write" on application_tasks for all
  using (exists (
    select 1 from applications a where a.id = application_tasks.application_id
      and staff_can_view_student(a.student_id)
  ))
  with check (exists (
    select 1 from applications a where a.id = application_tasks.application_id
      and staff_can_view_student(a.student_id)
  ));

-- Reference data: readable by any signed-in staff or student (checklists /
-- samples aren't sensitive); writable by staff.
create policy "document_templates_select" on document_templates for select
  using (auth.role() = 'authenticated');
create policy "document_templates_write" on document_templates for all
  using (is_active_staff()) with check (is_active_staff());

create policy "student_documents_select" on student_documents for select
  using (staff_can_view_student(student_id) or is_own_student(student_id));
create policy "student_documents_staff_write" on student_documents for all
  using (staff_can_view_student(student_id)) with check (staff_can_view_student(student_id));
-- A student may set their own document to 'submitted' only — never
-- 'verified'/'rejected', which stays staff-only (mirrors the old 0003 rule).
create policy "student_documents_upload_self" on student_documents for update
  using (is_own_student(student_id))
  with check (status = 'submitted' and is_own_student(student_id));

create policy "visa_records_select" on visa_records for select
  using (exists (
    select 1 from applications a where a.id = visa_records.application_id
      and (staff_can_view_student(a.student_id) or is_own_student(a.student_id))
  ));
create policy "visa_records_write" on visa_records for all
  using (exists (
    select 1 from applications a where a.id = visa_records.application_id
      and staff_can_view_student(a.student_id)
  ))
  with check (exists (
    select 1 from applications a where a.id = visa_records.application_id
      and staff_can_view_student(a.student_id)
  ));
