-- When a student was sent the welcome email (0339).
--
-- Registration & Portal Access sends a student their portal login. The first
-- send after their signed agreement is on file is the welcome — "Welcome
-- aboard", the boarding pass, their HMARK team, what happens next — and every
-- send after it is the login on its own, unless staff tick "Send the welcome
-- again". This row is how the portal knows the welcome has gone: one per
-- student, the latest welcome, to whom and by whom.
--
-- Written by the server once the email has actually left (with the service
-- role: the staff member's right to send was established by reading the
-- login, which only staff who can see the student may do). Readable by staff
-- who can see the student, so the panel can say when it went.
--
-- Left out of the audit log like invoice_email_log: a record of mail sent,
-- with nothing in it to restore.

create table if not exists public.student_welcome_emails (
  student_id uuid primary key references public.leads (id) on delete cascade,
  sent_at timestamptz not null default now(),
  sent_by uuid references public.staff (id) on delete set null,
  sent_to text not null check (btrim(sent_to) <> '')
);

alter table public.student_welcome_emails enable row level security;
revoke all on public.student_welcome_emails from anon;

drop policy if exists student_welcome_emails_select on public.student_welcome_emails;
create policy student_welcome_emails_select on public.student_welcome_emails
  for select to authenticated
  using ((select public.staff_can_view_student(student_id)));

create or replace function public.audit_excluded(p_table text) returns boolean
language sql immutable as $$
  select p_table = any (array[
    'audit_log', 'notifications', 'notification_reminders', 'login_events', 'invoice_email_log',
    'student_intake_counters', 'invoice_number_counters', 'student_code_holds',
    'staff_login_credentials', 'partner_login_credentials', 'encrypted_credentials',
    'application_interview_credentials', 'office_qr_tokens', 'scholarship_body_update_runs',
    'message_read_markers', 'support_ticket_read_markers', 'trashed_files',
    'calendar_invites', 'calendar_reminder_log', 'student_gmail_recovery',
    'student_welcome_emails'
  ])
$$;
