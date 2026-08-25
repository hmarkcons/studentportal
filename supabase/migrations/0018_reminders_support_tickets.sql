-- HMARK CRM rebuild — step 14: two gaps found while planning the app rework.
-- Module 1K (generic per-student deadlines, not tied to one application) and
-- Module 2J (student support ticketing) had no backing table in 0005-0017.
-- Run after 0017_attendance_additional_services.sql.

create table reminders (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references leads (id) on delete cascade,
  type text not null check (type in ('stall', 'deadline', 'follow_up')),
  due_date date,
  resolved boolean not null default false,
  created_by uuid references staff (id),
  created_at timestamptz not null default now()
);

create type ticket_status as enum ('open', 'in_progress', 'resolved');

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references leads (id) on delete cascade,
  subject text not null,
  body text not null,
  status ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_support_tickets_updated_at on support_tickets;
create trigger trg_support_tickets_updated_at
  before update on support_tickets
  for each row execute function set_updated_at();

create table support_ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets (id) on delete cascade,
  author_type text not null check (author_type in ('staff', 'student')),
  author_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table reminders enable row level security;
alter table support_tickets enable row level security;
alter table support_ticket_replies enable row level security;

create policy "reminders_select" on reminders for select
  using (staff_can_view_student(student_id) or is_own_student(student_id));
create policy "reminders_write" on reminders for all
  using (staff_can_view_student(student_id)) with check (staff_can_view_student(student_id));

create policy "support_tickets_select" on support_tickets for select
  using (staff_can_view_student(student_id) or is_own_student(student_id));
create policy "support_tickets_insert" on support_tickets for insert
  with check (staff_can_view_student(student_id) or is_own_student(student_id));
create policy "support_tickets_update" on support_tickets for update
  using (staff_can_view_student(student_id) or is_own_student(student_id))
  with check (staff_can_view_student(student_id) or is_own_student(student_id));

create policy "support_ticket_replies_select" on support_ticket_replies for select
  using (exists (
    select 1 from support_tickets t where t.id = support_ticket_replies.ticket_id
      and (staff_can_view_student(t.student_id) or is_own_student(t.student_id))
  ));
create policy "support_ticket_replies_insert" on support_ticket_replies for insert
  with check (exists (
    select 1 from support_tickets t where t.id = support_ticket_replies.ticket_id
      and (staff_can_view_student(t.student_id) or is_own_student(t.student_id))
  ));
