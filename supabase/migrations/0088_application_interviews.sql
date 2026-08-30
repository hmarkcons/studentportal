-- Interview scheduling (new "Interview" section alongside the document
-- checklist categories) — staff record university/program details, an
-- interview link, and candidate available slots; the actual confirmed
-- slot is agreed with the student over a phone call and recorded
-- separately once set.

create table application_interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references applications (id) on delete cascade,
  university_name text,
  program_name text,
  interview_details text,
  interview_link text,
  available_slots jsonb not null default '[]', -- array of ISO datetime strings, staff-proposed candidate slots
  confirmed_datetime timestamptz, -- the slot actually confirmed with the student by phone
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_application_interviews_updated_at on application_interviews;
create trigger trg_application_interviews_updated_at
  before update on application_interviews
  for each row execute function set_updated_at();

alter table application_interviews enable row level security;

create policy "application_interviews_select" on application_interviews for select
  using (exists (
    select 1 from applications a where a.id = application_interviews.application_id
      and (staff_can_view_student(a.student_id) or is_own_student(a.student_id))
  ));
create policy "application_interviews_write" on application_interviews for all
  using (exists (
    select 1 from applications a where a.id = application_interviews.application_id
      and staff_can_view_student(a.student_id)
  ))
  with check (exists (
    select 1 from applications a where a.id = application_interviews.application_id
      and staff_can_view_student(a.student_id)
  ));
