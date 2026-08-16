-- Case Flow — initial schema, RLS policies, and document checklist seed data.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists staff (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('counselor', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  destination_country text not null,
  assigned_counselor_id uuid references staff (id),
  current_stage text not null default 'inquiry' check (
    current_stage in (
      'inquiry', 'profile_eval', 'shortlisting', 'application',
      'offer', 'visa', 'accommodation', 'enrollment'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_templates (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  document_name text not null,
  required boolean not null default true,
  sort_order int not null default 0
);

create table if not exists student_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  template_id uuid references document_templates (id),
  status text not null default 'missing' check (
    status in ('missing', 'submitted', 'under_review', 'verified', 'rejected')
  ),
  file_path text,
  uploaded_at timestamptz,
  verified_by uuid references staff (id),
  verified_at timestamptz,
  notes text
);

create table if not exists stage_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  stage text not null,
  entered_at timestamptz not null default now(),
  moved_by uuid references staff (id)
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  author_id uuid references staff (id),
  channel text not null check (channel in ('call', 'email', 'whatsapp', 'system')),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  type text not null check (type in ('stall', 'deadline')),
  due_date date,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Triggers: keep students.updated_at fresh, and auto-log stage changes
-- ---------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_students_updated_at on students;
create trigger trg_students_updated_at
  before update on students
  for each row execute function set_updated_at();

create or replace function log_stage_change() returns trigger
language plpgsql security definer as $$
begin
  if (tg_op = 'INSERT') or (new.current_stage is distinct from old.current_stage) then
    insert into stage_history (student_id, stage, moved_by)
    values (new.id, new.current_stage, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_stage_change on students;
create trigger trg_log_stage_change
  after insert or update on students
  for each row execute function log_stage_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table staff enable row level security;
alter table students enable row level security;
alter table document_templates enable row level security;
alter table student_documents enable row level security;
alter table stage_history enable row level security;
alter table notes enable row level security;
alter table reminders enable row level security;

-- security definer helper avoids recursive RLS checks against `staff` itself
create or replace function is_admin() returns boolean
language sql security definer stable as $$
  select exists (select 1 from staff where id = auth.uid() and role = 'admin');
$$;

-- staff: everyone can read their own row; admins can read all
create policy "staff_select" on staff for select
  using (id = auth.uid() or is_admin());

-- students: a counselor sees only their assigned students; admin sees all
create policy "students_select" on students for select
  using (assigned_counselor_id = auth.uid() or is_admin());
create policy "students_insert" on students for insert
  with check (assigned_counselor_id = auth.uid() or is_admin());
create policy "students_update" on students for update
  using (assigned_counselor_id = auth.uid() or is_admin());
create policy "students_delete" on students for delete
  using (is_admin());

-- document_templates: reference data, readable by any signed-in staff member
create policy "document_templates_select" on document_templates for select
  using (auth.role() = 'authenticated');
create policy "document_templates_write" on document_templates for all
  using (is_admin()) with check (is_admin());

-- student_documents / stage_history / notes / reminders: visibility follows the parent student
create policy "student_documents_select" on student_documents for select
  using (exists (
    select 1 from students st
    where st.id = student_documents.student_id
      and (st.assigned_counselor_id = auth.uid() or is_admin())
  ));
create policy "student_documents_write" on student_documents for all
  using (exists (
    select 1 from students st
    where st.id = student_documents.student_id
      and (st.assigned_counselor_id = auth.uid() or is_admin())
  ))
  with check (exists (
    select 1 from students st
    where st.id = student_documents.student_id
      and (st.assigned_counselor_id = auth.uid() or is_admin())
  ));

create policy "stage_history_select" on stage_history for select
  using (exists (
    select 1 from students st
    where st.id = stage_history.student_id
      and (st.assigned_counselor_id = auth.uid() or is_admin())
  ));

create policy "notes_select" on notes for select
  using (exists (
    select 1 from students st
    where st.id = notes.student_id
      and (st.assigned_counselor_id = auth.uid() or is_admin())
  ));
create policy "notes_write" on notes for all
  using (exists (
    select 1 from students st
    where st.id = notes.student_id
      and (st.assigned_counselor_id = auth.uid() or is_admin())
  ))
  with check (exists (
    select 1 from students st
    where st.id = notes.student_id
      and (st.assigned_counselor_id = auth.uid() or is_admin())
  ));

create policy "reminders_select" on reminders for select
  using (exists (
    select 1 from students st
    where st.id = reminders.student_id
      and (st.assigned_counselor_id = auth.uid() or is_admin())
  ));
create policy "reminders_write" on reminders for all
  using (exists (
    select 1 from students st
    where st.id = reminders.student_id
      and (st.assigned_counselor_id = auth.uid() or is_admin())
  ))
  with check (exists (
    select 1 from students st
    where st.id = reminders.student_id
      and (st.assigned_counselor_id = auth.uid() or is_admin())
  ));

-- ---------------------------------------------------------------------------
-- Seed data: document checklist drafts for the 7 confirmed destinations
-- (core documents apply to every destination; edit freely to match reality)
-- ---------------------------------------------------------------------------

insert into document_templates (country, document_name, required, sort_order)
select c.country, d.document_name, true, d.sort_order
from (values ('UK'), ('Australia'), ('Italy'), ('Germany'), ('France'), ('Austria'), ('Finland')) as c(country)
cross join (values
  ('Passport', 1),
  ('Academic transcripts & certificates', 2),
  ('English language test (IELTS/TOEFL/PTE)', 3),
  ('Statement of purpose', 4),
  ('Recommendation letters', 5),
  ('CV / resume', 6),
  ('Proof of funds', 7),
  ('Passport-size photos', 8)
) as d(document_name, sort_order);

insert into document_templates (country, document_name, required, sort_order) values
  ('UK', 'CAS (Confirmation of Acceptance for Studies)', true, 9),
  ('UK', 'Maintenance funds evidence (28-day rule)', true, 10),
  ('UK', 'TB test certificate (country-dependent)', false, 11),
  ('UK', 'ATAS clearance (select STEM courses)', false, 12),

  ('Australia', 'CoE (Confirmation of Enrolment)', true, 9),
  ('Australia', 'GTE (Genuine Temporary Entrant) statement', true, 10),
  ('Australia', 'OSHC health cover', true, 11),
  ('Australia', 'Student visa (subclass 500) application', true, 12),
  ('Australia', 'Biometrics', true, 13),

  ('Italy', 'Dichiarazione di Valore / CIMEA statement', true, 9),
  ('Italy', 'Universitaly pre-enrollment', true, 10),
  ('Italy', 'Type D (national) visa', true, 11),
  ('Italy', 'Proof of accommodation', true, 12),
  ('Italy', 'Health insurance', true, 13),

  ('Germany', 'APS certificate (where applicable)', false, 9),
  ('Germany', 'Blocked account (Sperrkonto)', true, 10),
  ('Germany', 'Zulassungsbescheid (admission letter)', true, 11),
  ('Germany', 'Health insurance', true, 12),
  ('Germany', 'Type D (national) visa', true, 13),

  ('France', 'Campus France procedure (where applicable)', false, 9),
  ('France', 'VLS-TS long-stay student visa', true, 10),
  ('France', 'Proof of accommodation', true, 11),
  ('France', 'Financial guarantee', true, 12),
  ('France', 'OFII validation (post-arrival)', true, 13),

  ('Austria', 'Admission letter', true, 9),
  ('Austria', 'Proof of financial means', true, 10),
  ('Austria', 'Health insurance', true, 11),
  ('Austria', 'Student residence permit application', true, 12),

  ('Finland', 'Enter Finland residence permit application', true, 9),
  ('Finland', 'Proof of funds', true, 10),
  ('Finland', 'Tuition payment proof (non-EU)', false, 11),
  ('Finland', 'Admission letter', true, 12);
