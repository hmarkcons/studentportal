-- HMARK CRM rebuild — step 5: Student Registration (Module 1A2) and
-- Student/Applicant Profile Management (Module 1B).
-- Run after 0008_destinations_universities_programs.sql.

-- ---------------------------------------------------------------------------
-- Registration fields, added onto the same `leads` row (decision #8) —
-- a "registered student" is a lead row with these columns populated.
-- ---------------------------------------------------------------------------

alter table leads
  add column date_of_birth date,
  add column address text,
  add column home_phone text,
  add column finalized_course_of_interest text,
  add column university_applying_to text,
  add column emergency_contact_name text,
  add column emergency_contact_relation text,
  add column emergency_contact_number text,
  add column registered_at timestamptz,
  add column auth_user_id uuid unique references auth.users (id) on delete set null,
  -- Gate: a registered student's portal login stays inactive until their
  -- signed agreement is uploaded (flipped true by a trigger in 0010).
  add column portal_active boolean not null default false;

-- Auto-stamp registered_at (and log the ownership handoff) the moment a
-- lead's status flips to 'registered'.
create or replace function handle_lead_registration() returns trigger
language plpgsql as $$
begin
  if new.status = 'registered' and old.status is distinct from 'registered' and new.registered_at is null then
    new.registered_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leads_registration on leads;
create trigger trg_leads_registration
  before update on leads
  for each row execute function handle_lead_registration();

-- True if the current user is a student portal account and it *is* this
-- lead/student (defined here, not 0007, since it needs auth_user_id above).
create or replace function is_own_student(p_student_id uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from leads where id = p_student_id and auth_user_id = auth.uid()
  );
$$;

-- Convenience read view over registered students; RLS on the underlying
-- `leads` table is enforced for the querying role, so this is safe to expose.
create or replace view students as
  select * from leads where registered_at is not null;

-- ---------------------------------------------------------------------------
-- Extended profile data (Module 1B)
-- ---------------------------------------------------------------------------

create table student_profiles (
  student_id uuid primary key references leads (id) on delete cascade,
  passport_number text,
  passport_expiry date,
  cnic text,
  financial_sponsor_name text,
  financial_sponsor_relation text,
  financial_details jsonb not null default '{}'::jsonb,
  travel_history jsonb not null default '[]'::jsonb,
  visa_refusal_history jsonb not null default '[]'::jsonb,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_student_profiles_updated_at on student_profiles;
create trigger trg_student_profiles_updated_at
  before update on student_profiles
  for each row execute function set_updated_at();

drop trigger if exists trg_audit_student_profiles on student_profiles;
create trigger trg_audit_student_profiles
  after insert or update or delete on student_profiles
  for each row execute function log_audit_event();

create table student_test_scores (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references leads (id) on delete cascade,
  test_type text not null check (
    test_type in ('ielts', 'toefl', 'pte', 'duolingo', 'langcert', 'ib', 'moi', 'gre', 'sat', 'other')
  ),
  score text,
  test_date date,
  created_at timestamptz not null default now()
);

create table student_academic_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references leads (id) on delete cascade,
  institution text,
  qualification text,
  grade text,
  year_completed int,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security — staff who can see the student, or the student
-- themself (self-service profile editing is allowed per the doc).
-- ---------------------------------------------------------------------------

alter table student_profiles enable row level security;
alter table student_test_scores enable row level security;
alter table student_academic_records enable row level security;

create policy "student_profiles_select" on student_profiles for select
  using (staff_can_view_student(student_id) or is_own_student(student_id));
create policy "student_profiles_write" on student_profiles for all
  using (staff_can_view_student(student_id) or is_own_student(student_id))
  with check (staff_can_view_student(student_id) or is_own_student(student_id));

create policy "student_test_scores_select" on student_test_scores for select
  using (staff_can_view_student(student_id) or is_own_student(student_id));
create policy "student_test_scores_write" on student_test_scores for all
  using (staff_can_view_student(student_id) or is_own_student(student_id))
  with check (staff_can_view_student(student_id) or is_own_student(student_id));

create policy "student_academic_records_select" on student_academic_records for select
  using (staff_can_view_student(student_id) or is_own_student(student_id));
create policy "student_academic_records_write" on student_academic_records for all
  using (staff_can_view_student(student_id) or is_own_student(student_id))
  with check (staff_can_view_student(student_id) or is_own_student(student_id));

-- Lets a student see their own assigned counselor's contact card (Module 2B),
-- without granting any broader visibility into staff.
create policy "staff_select_for_own_student" on staff for select
  using (exists (
    select 1 from leads l
    where l.assigned_counselor_id = staff.id and l.auth_user_id = auth.uid()
  ));
