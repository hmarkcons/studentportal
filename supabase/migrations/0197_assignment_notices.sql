-- Who has already been told about which student.
--
-- One row per (student, staff member), so the counselor assigned at
-- registration is emailed once however many times the registration action is
-- re-run, and a counselor the student is later reassigned to is emailed
-- because they are a different person — which is the whole point: nobody
-- should inherit a student silently.
create table if not exists public.student_assignment_notices (
  student_id uuid not null references public.leads (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  -- counselor | processing | management, so the same person in two roles is
  -- still only told once but the record says why they were told.
  role text not null,
  sent_at timestamptz not null default now(),
  primary key (student_id, staff_id)
);

comment on table public.student_assignment_notices is
  'One row per staff member already emailed about a student being registered or assigned to them. The primary key is what stops a re-run sending a second copy.';

alter table public.student_assignment_notices enable row level security;

-- Written by the server action that sends the mail, which runs as the signed-in
-- staff member. Readable by active staff so the student page could show "the
-- counselor was notified on…" without another table.
drop policy if exists "assignment_notices_select" on public.student_assignment_notices;
create policy "assignment_notices_select" on public.student_assignment_notices
  for select using (is_active_staff());

drop policy if exists "assignment_notices_insert" on public.student_assignment_notices;
create policy "assignment_notices_insert" on public.student_assignment_notices
  for insert with check (is_active_staff());
