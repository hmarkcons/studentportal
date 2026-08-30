-- Education/qualification history for a registered student (new "Education"
-- tab on the student profile). Secondary School and High School are treated
-- as the two standard entries every student should have; the remaining
-- types are added on top via the tab's "Add qualification" picker.
-- One row per (student, type) — a student doesn't have two "Bachelors (3
-- Years)" entries, they either have it or don't.

create table student_qualifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references leads (id) on delete cascade,
  qualification_type text not null check (qualification_type in (
    'secondary_school', 'high_school',
    'associate_degree_2yr', 'bachelors_topup_2yr', 'bachelors_3yr', 'bachelors_4yr',
    'masters_16yr', 'masters_3_5yr', 'masters_1yr', 'masters_18yr'
  )),
  qualification_name text,
  institution_name text,
  city text,
  country text,
  address text,
  grade_percentage text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, qualification_type)
);

drop trigger if exists trg_student_qualifications_updated_at on student_qualifications;
create trigger trg_student_qualifications_updated_at
  before update on student_qualifications
  for each row execute function set_updated_at();

alter table student_qualifications enable row level security;

create policy "student_qualifications_select" on student_qualifications for select
  using (staff_can_view_student(student_id) or is_own_student(student_id));
create policy "student_qualifications_write" on student_qualifications for all
  using (staff_can_view_student(student_id))
  with check (staff_can_view_student(student_id));
