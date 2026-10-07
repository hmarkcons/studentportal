-- Notifications: every user's alerts — staff, students and partners — on
-- their dashboard, in the bell on every page, and by email.
--
-- Two kinds of alert reach a person:
--
--   * Things to do — a document to upload, a message waiting on a reply, a
--     leave request to decide. These are worked out from the live records
--     each time they are shown (the staff queue, the student summary) and
--     stay until the work is done. Nothing here stores them.
--
--   * Things that happened — a message arrived, a document was approved, an
--     application moved, a lead was assigned. These are stored here, as rows
--     the triggers below write when the event happens, whatever part of the
--     app (or an import, or an RPC) caused it. They clear when read.
--
-- Every stored alert is emailed to its person once, a couple of minutes after
-- it happened, unless they have read it in the portal by then (the app sends
-- them: claim_notification_emails). Some are stored only to be emailed — a
-- student's message to staff is already on the staff to-do list, so it is not
-- shown twice (feed = false). Some are not emailed, because another mail
-- already says the same thing (leave decisions, a registered student's
-- reassignment) or because one message went to everyone (a broadcast).
--
-- Repeats are grouped: while a person has not read the alert for a thread,
-- another message on it adds to the same row ("3 new messages") instead of a
-- new row and a new email. Two thousand leads imported and assigned to one
-- counsellor are one alert and one email.

do $$
begin
  if to_regprocedure('public.is_active_staff()') is null then
    raise exception '0320: is_active_staff() is missing';
  end if;
  if to_regclass('public.message_read_markers') is null then
    raise exception '0320: message_read_markers (0130) is missing';
  end if;
  if to_regclass('public.support_ticket_read_markers') is null then
    raise exception '0320: support_ticket_read_markers (0131) is missing';
  end if;
  if to_regclass('public.leave_requests') is null then
    raise exception '0320: leave_requests (0272) is missing';
  end if;
end $$;

-- A message sent to many students at once (/marketing/broadcast) is marked,
-- so it is shown to each of them but not emailed to every one.
alter table public.messages add column if not exists broadcast boolean not null default false;

-- ------------------------------------------------------------------ the table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  -- One unread row per person and group: a repeat adds to it.
  group_key text,
  title text not null,
  -- The title once there are several, with {n} for how many.
  title_many text,
  body text,
  -- Where it is dealt with, in that person's portal; link_many once grouped.
  link text,
  link_many text,
  student_id uuid references public.leads (id) on delete cascade,
  count integer not null default 1,
  -- Shown under "What's new"; false for one only emailed, because the to-do
  -- list already shows it.
  feed boolean not null default true,
  email_state text not null default 'pending'
    check (email_state in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  email_claimed_at timestamptz,
  emailed_at timestamptz,
  email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_idx on public.notifications (user_id, updated_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index if not exists notifications_email_idx on public.notifications (updated_at) where email_state in ('pending', 'sending');
create unique index if not exists notifications_open_group_idx
  on public.notifications (user_id, group_key) where read_at is null and group_key is not null;

comment on table public.notifications is
  'Alerts of things that happened, one row per person (grouped while unread), written by triggers and emailed by the app (0320).';

alter table public.notifications enable row level security;

-- Each person reads their own. Nobody signed in writes here: the triggers do,
-- and a read mark goes through mark_notifications_read.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select
  using (user_id = (select auth.uid()));

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

-- Reminders by email of what is still to do, at most one per kind per spell
-- (the app's daily reminder run). Service role only.
create table if not exists public.notification_reminders (
  user_id uuid not null references auth.users (id) on delete cascade,
  reminder text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, reminder)
);
alter table public.notification_reminders enable row level security;
revoke all on public.notification_reminders from anon, authenticated;

-- ---------------------------------------------------------------- notify()
-- Writes one alert, or adds to the open one of its group. Never to the person
-- who caused it, and never to nobody.
create or replace function public.notify(
  p_user uuid,
  p_kind text,
  p_group text,
  p_title text,
  p_title_many text,
  p_body text,
  p_link text,
  p_link_many text default null,
  p_student uuid default null,
  p_feed boolean default true,
  p_email boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = auth.uid() then
    return;
  end if;
  insert into notifications (user_id, kind, group_key, title, title_many, body, link, link_many, student_id, feed, email_state)
  values (
    p_user, p_kind, p_group, left(coalesce(nullif(btrim(p_title), ''), 'Notification'), 300), left(p_title_many, 300), left(p_body, 600), p_link, p_link_many,
    p_student, p_feed, case when p_email then 'pending' else 'skipped' end
  )
  on conflict (user_id, group_key) where read_at is null and group_key is not null
  do update set
    count = notifications.count + 1,
    title = excluded.title,
    body = excluded.body,
    link = excluded.link,
    updated_at = now(),
    -- Already emailed and still unread: once more only after twelve hours,
    -- so a busy thread is not an email a minute.
    -- One that was not to be emailed (a registered student's reassignment)
    -- is, once something joins it that is (a new lead).
    email_state = case
      when not p_email then notifications.email_state
      when notifications.email_state in ('skipped', 'failed') then 'pending'
      when notifications.email_state = 'sent' and notifications.emailed_at < now() - interval '12 hours' then 'pending'
      else notifications.email_state
    end;
end;
$$;

revoke execute on function public.notify(uuid, text, text, text, text, text, text, text, uuid, boolean, boolean) from public, anon, authenticated;

-- Who stands for a student, a student's staff, a university's partners.
create or replace function public.notify_student_user(p_student uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select auth_user_id from leads
  where id = p_student and portal_active and student_code is not null and auth_user_id is not null
$$;

create or replace function public.notify_student_staff(p_student uuid) returns table (staff_id uuid)
language sql stable security definer set search_path = public as $$
  select distinct s.id
  from leads l
  join staff s on s.id in (l.assigned_counselor_id, l.processing_officer_id)
  where l.id = p_student and s.status = 'active'
$$;

-- The one who works a student's file: their processing officer, else their counsellor.
create or replace function public.notify_student_handler(p_student uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.id from leads l join staff s on s.id = l.processing_officer_id where l.id = p_student and s.status = 'active'),
    (select s.id from leads l join staff s on s.id = l.assigned_counselor_id where l.id = p_student and s.status = 'active')
  )
$$;

create or replace function public.notify_stage_label(p_stage text) returns text
language sql immutable as $$
  select case p_stage
    when 'pre_enrolled' then 'Pre-Enrolled'
    when 'university_finalized' then 'University Finalized'
    else initcap(replace(coalesce(p_stage, ''), '_', ' '))
  end
$$;

revoke execute on function public.notify_student_user(uuid) from public, anon, authenticated;
revoke execute on function public.notify_student_staff(uuid) from public, anon, authenticated;
revoke execute on function public.notify_student_handler(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- messages
create or replace function public.notifications_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_uni text;
  r record;
begin
  if new.channel = 'internal_note' then
    return null;
  end if;

  if new.entity_type = 'student' then
    if new.direction = 'outbound' then
      perform notify(notify_student_user(new.entity_id), 'message', 'message:' || new.entity_id,
        'New message from HMARK', '{n} new messages from HMARK', new.body, '/portal/messages', null,
        new.entity_id, true, not coalesce(new.broadcast, false));
    else
      select full_name into v_name from leads where id = new.entity_id;
      for r in select staff_id from notify_student_staff(new.entity_id) loop
        perform notify(r.staff_id, 'student_message', 'student_message:' || new.entity_id,
          'New message from ' || coalesce(v_name, 'a student'), '{n} new messages from ' || coalesce(v_name, 'a student'),
          new.body, '/students/' || new.entity_id || '/communication', null, new.entity_id, false, true);
      end loop;
    end if;
  elsif new.entity_type = 'university' then
    select name into v_uni from universities where id = new.entity_id;
    if new.direction = 'outbound' then
      for r in select id from partner_university_accounts where university_id = new.entity_id and status = 'active' loop
        perform notify(r.id, 'message', 'message:university:' || new.entity_id,
          'New message from HMARK', '{n} new messages from HMARK', new.body, '/partner', null, null, true, true);
      end loop;
    else
      for r in
        select id from staff
        where status = 'active'
          and (role in ('management', 'super_admin') or roles && array['management', 'super_admin']::staff_role[])
      loop
        perform notify(r.id, 'partner_message', 'partner_message:' || new.entity_id,
          'Message from ' || coalesce(v_uni, 'a partner university'), '{n} messages from ' || coalesce(v_uni, 'a partner university'),
          new.body, '/setup/universities/' || new.entity_id || '#messages', null, null, true, true);
      end loop;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifications_on_message on public.messages;
create trigger trg_notifications_on_message
  after insert on public.messages
  for each row execute function public.notifications_on_message();

-- A thread opened clears its alert, on whichever side opened it.
create or replace function public.notifications_on_message_read() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update notifications set read_at = now()
  where read_at is null
    and group_key = case when new.side = 'student' then 'message:' else 'student_message:' end || new.student_id;
  return null;
end;
$$;

drop trigger if exists trg_notifications_on_message_read on public.message_read_markers;
create trigger trg_notifications_on_message_read
  after insert or update on public.message_read_markers
  for each row execute function public.notifications_on_message_read();

-- ------------------------------------------------------------ support tickets
create or replace function public.notifications_on_ticket() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  r record;
begin
  -- Opened by the student: their staff hear. One opened by staff on their
  -- behalf is that staff member's own doing.
  if not exists (select 1 from leads where id = new.student_id and auth_user_id = auth.uid()) then
    return null;
  end if;
  select full_name into v_name from leads where id = new.student_id;
  for r in select staff_id from notify_student_staff(new.student_id) loop
    perform notify(r.staff_id, 'ticket', 'ticket:' || new.id,
      'Support ticket from ' || coalesce(v_name, 'a student') || ': ' || coalesce(new.subject, ''), null,
      new.subject, '/support/' || new.id, null, new.student_id, false, true);
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_notifications_on_ticket on public.support_tickets;
create trigger trg_notifications_on_ticket
  after insert on public.support_tickets
  for each row execute function public.notifications_on_ticket();

create or replace function public.notifications_on_ticket_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ticket record;
  v_name text;
  r record;
begin
  select id, student_id, subject into v_ticket from support_tickets where id = new.ticket_id;
  if v_ticket.id is null then
    return null;
  end if;
  if new.author_type = 'student' then
    select full_name into v_name from leads where id = v_ticket.student_id;
    for r in select staff_id from notify_student_staff(v_ticket.student_id) loop
      perform notify(r.staff_id, 'ticket', 'ticket:' || v_ticket.id,
        'Support ticket from ' || coalesce(v_name, 'a student') || ': ' || coalesce(v_ticket.subject, ''),
        '{n} replies on ' || coalesce(v_name, 'a student') || '''s ticket: ' || coalesce(v_ticket.subject, ''),
        new.body, '/support/' || v_ticket.id, null, v_ticket.student_id, false, true);
    end loop;
  else
    perform notify(notify_student_user(v_ticket.student_id), 'ticket_reply', 'ticket_reply:' || v_ticket.id,
      'Reply to your ticket: ' || coalesce(v_ticket.subject, 'Support'), '{n} replies to your ticket: ' || coalesce(v_ticket.subject, 'Support'),
      new.body, '/portal/support/' || v_ticket.id, null, v_ticket.student_id, true, true);
    -- Answered: the staff alert for it is done.
    update notifications set read_at = now() where read_at is null and group_key = 'ticket:' || v_ticket.id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifications_on_ticket_reply on public.support_ticket_replies;
create trigger trg_notifications_on_ticket_reply
  after insert on public.support_ticket_replies
  for each row execute function public.notifications_on_ticket_reply();

create or replace function public.notifications_on_ticket_read() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.side = 'student' then
    update notifications set read_at = now() where read_at is null and group_key = 'ticket_reply:' || new.ticket_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifications_on_ticket_read on public.support_ticket_read_markers;
create trigger trg_notifications_on_ticket_read
  after insert or update on public.support_ticket_read_markers
  for each row execute function public.notifications_on_ticket_read();

-- --------------------------------------------------------------- documents
create or replace function public.notifications_on_document() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_doc text;
  v_name text;
begin
  v_doc := coalesce(
    nullif(btrim(new.custom_name), ''),
    (select name from document_templates where id = new.template_id),
    initcap(replace(coalesce(new.category, ''), '_', ' ')),
    'A document'
  );
  if v_doc = '' then
    v_doc := 'A document';
  end if;

  if new.status = 'submitted'
     and coalesce(new.uploaded_by_role, 'student') = 'student'
     and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    select full_name into v_name from leads where id = new.student_id;
    perform notify(notify_student_handler(new.student_id), 'document_submitted', 'documents:' || new.student_id,
      coalesce(v_name, 'A student') || ' uploaded ' || v_doc, coalesce(v_name, 'A student') || ' uploaded {n} documents',
      'Waiting for your review.', '/students/' || new.student_id || '/documents', null, new.student_id, false, true);
  elsif tg_op = 'UPDATE' and new.status in ('verified', 'rejected') and old.status is distinct from new.status then
    if new.status = 'verified' then
      perform notify(notify_student_user(new.student_id), 'document_approved', 'document_approved:' || new.student_id,
        v_doc || ' approved', '{n} documents approved', null, '/portal/documents', null, new.student_id, true, true);
    else
      perform notify(notify_student_user(new.student_id), 'document_rejected', 'document_rejected:' || new.student_id,
        v_doc || ' needs uploading again', '{n} documents need uploading again',
        nullif(btrim(coalesce(new.rejected_reason, '')), ''), '/portal/documents', null, new.student_id, true, true);
    end if;
    -- Nothing of theirs left to review: the staff alert is done.
    if not exists (select 1 from student_documents where student_id = new.student_id and status in ('submitted', 'under_review')) then
      update notifications set read_at = now() where read_at is null and group_key = 'documents:' || new.student_id;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifications_on_document on public.student_documents;
create trigger trg_notifications_on_document
  after insert or update of status on public.student_documents
  for each row execute function public.notifications_on_document();

-- ------------------------------------------------------------ applications
create or replace function public.notifications_on_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uni text;
  v_prog text;
  v_name text;
  v_label text;
  r record;
begin
  select name into v_uni from universities where id = new.university_id;
  select name into v_prog from programs where id = new.program_id;
  v_uni := coalesce(v_uni, 'A university');

  if tg_op = 'INSERT' then
    perform notify(notify_student_user(new.student_id), 'application_new', 'application_new:' || new.student_id,
      'New application: ' || v_uni, '{n} new applications', v_prog,
      '/portal/applications/' || new.id, '/portal/applications', new.student_id, true, true);
    return null;
  end if;

  if new.current_stage is not distinct from old.current_stage then
    return null;
  end if;
  v_label := notify_stage_label(new.current_stage);
  perform notify(notify_student_user(new.student_id), 'application_stage', 'application_stage:' || new.id,
    v_uni || ': ' || v_label, v_uni || ': ' || v_label, v_prog,
    '/portal/applications/' || new.id, null, new.student_id, true, true);

  select full_name into v_name from leads where id = new.student_id;
  -- Submitted to the university: its partners have it to decide.
  if new.current_stage = 'application_submitted' then
    for r in select id from partner_university_accounts where university_id = new.university_id and status = 'active' loop
      perform notify(r.id, 'application_received', 'application_received:' || new.university_id,
        'New application: ' || coalesce(v_name, 'a student'), '{n} new applications', v_prog,
        '/partner/applications/' || new.id, '/partner', null, true, true);
    end loop;
  end if;
  -- Moved by the university's partner: the student's processing officer hears.
  if exists (select 1 from partner_university_accounts where id = auth.uid()) then
    perform notify(notify_student_handler(new.student_id), 'partner_update', 'partner_update:' || new.id,
      v_uni || ' moved ' || coalesce(v_name, 'a student') || ' to ' || v_label, null, v_prog,
      '/students/' || new.student_id || '/applications/' || new.id, null, new.student_id, true, true);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifications_on_application on public.applications;
create trigger trg_notifications_on_application
  after insert or update of current_stage on public.applications
  for each row execute function public.notifications_on_application();

-- ------------------------------------------------------------------ money
create or replace function public.notifications_on_invoice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify(notify_student_user(new.student_id), 'invoice', 'invoice:' || new.student_id,
    'New invoice' || coalesce(' ' || nullif(btrim(new.invoice_number), ''), ''), '{n} new invoices',
    'See it, and how to pay, under Payments.', '/portal/payments', null, new.student_id, true, true);
  return null;
end;
$$;

drop trigger if exists trg_notifications_on_invoice on public.invoices;
create trigger trg_notifications_on_invoice
  after insert on public.invoices
  for each row execute function public.notifications_on_invoice();

create or replace function public.notifications_on_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_invoice record;
  v_amount numeric;
begin
  if not (coalesce(new.amount_paid, 0) > coalesce(old.amount_paid, 0) or (new.status = 'paid' and old.status is distinct from 'paid')) then
    return null;
  end if;
  select student_id, currency into v_invoice from invoices where id = new.invoice_id;
  v_amount := coalesce(new.amount_paid, 0) - coalesce(old.amount_paid, 0);
  if v_amount <= 0 then
    v_amount := new.amount;
  end if;
  perform notify(notify_student_user(v_invoice.student_id), 'payment', null,
    'Payment received: ' || coalesce(v_invoice.currency, '') || ' ' || rtrim(to_char(v_amount, 'FM999,999,990.##'), '.'), null,
    'Instalment ' || coalesce(new.installment_no::text, '') || case when new.status = 'paid' then ' is paid in full.' else ' — part paid.' end,
    '/portal/payments', null, v_invoice.student_id, true, true);
  return null;
end;
$$;

drop trigger if exists trg_notifications_on_payment on public.invoice_installments;
create trigger trg_notifications_on_payment
  after update on public.invoice_installments
  for each row execute function public.notifications_on_payment();

-- -------------------------------------------------------------- interviews
create or replace function public.notifications_on_interview() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid;
  v_uni text;
begin
  select a.student_id, u.name into v_student, v_uni
  from applications a left join universities u on u.id = a.university_id
  where a.id = new.application_id;
  v_uni := coalesce(nullif(btrim(new.university_name), ''), v_uni, 'the university');
  if tg_op = 'INSERT' then
    perform notify(notify_student_user(v_student), 'interview', 'interview:' || new.id,
      'Interview arranged with ' || v_uni, null, 'See the details under Appointments.', '/portal/appointments', null, v_student, true, true);
  elsif new.confirmed_datetime is not null and new.confirmed_datetime is distinct from old.confirmed_datetime then
    perform notify(notify_student_user(v_student), 'interview', 'interview:' || new.id,
      'Interview confirmed with ' || v_uni,
      null, to_char(new.confirmed_datetime at time zone 'Asia/Karachi', 'FMDD Mon YYYY, FMHH12:MI AM') || ' (Pakistan time)',
      '/portal/appointments', null, v_student, true, true);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifications_on_interview on public.application_interviews;
create trigger trg_notifications_on_interview
  after insert or update of confirmed_datetime on public.application_interviews
  for each row execute function public.notifications_on_interview();

-- -------------------------------------------------------------- agreements
create or replace function public.notifications_on_agreement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending_signature' and (tg_op = 'INSERT' or old.status is distinct from 'pending_signature') then
    perform notify(notify_student_user(new.student_id), 'agreement', 'agreement:' || new.student_id,
      'Your agreement is ready to sign', null, 'Sign it in the portal to open the rest of it.',
      '/portal/agreement', null, new.student_id, true, true);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifications_on_agreement on public.agreements;
create trigger trg_notifications_on_agreement
  after insert or update of status on public.agreements
  for each row execute function public.notifications_on_agreement();

-- ----------------------------------------------------- leads and students
create or replace function public.notifications_on_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_registered boolean := coalesce(new.status = 'registered', false);
begin
  if new.assigned_counselor_id is not null
     and (tg_op = 'INSERT' or new.assigned_counselor_id is distinct from old.assigned_counselor_id) then
    -- A registered student moved to a counsellor is emailed by the
    -- registration notice already; here it is only listed.
    perform notify(new.assigned_counselor_id, 'lead_assigned', 'leads_assigned',
      case when v_registered then 'Student assigned to you: ' else 'Lead assigned to you: ' end || coalesce(new.full_name, 'a lead'),
      '{n} leads assigned to you', null,
      case when v_registered then '/students/' || new.id else '/leads/' || new.id end, '/leads',
      new.id, true, not v_registered);
  end if;
  if new.processing_officer_id is not null
     and (tg_op = 'INSERT' or new.processing_officer_id is distinct from old.processing_officer_id) then
    -- The registration notice mails the processing officer; listed here.
    perform notify(new.processing_officer_id, 'student_assigned', 'students_assigned',
      'Student assigned to you: ' || coalesce(new.full_name, 'a student'), '{n} students assigned to you', null,
      '/students/' || new.id, '/students', new.id, true, false);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifications_on_assignment on public.leads;
create trigger trg_notifications_on_assignment
  after insert or update of assigned_counselor_id, processing_officer_id on public.leads
  for each row execute function public.notifications_on_assignment();

-- ------------------------------------------------------------------- tasks
create or replace function public.notifications_on_task() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid;
  v_name text;
  v_uni text;
begin
  if new.owner_id is null or new.status <> 'pending' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id then
    return null;
  end if;
  select a.student_id, l.full_name, u.name into v_student, v_name, v_uni
  from applications a
  left join leads l on l.id = a.student_id
  left join universities u on u.id = a.university_id
  where a.id = new.application_id;
  perform notify(new.owner_id, 'task_assigned', null,
    'Task for you: ' || coalesce(new.description, 'a task'), null,
    concat_ws(' · ', v_name, v_uni, case when new.due_date is not null then 'due ' || to_char(new.due_date, 'FMDD Mon YYYY') end),
    '/students/' || v_student || '/applications/' || new.application_id || '#task-' || new.id, null, v_student, true, true);
  return null;
end;
$$;

drop trigger if exists trg_notifications_on_task on public.application_tasks;
create trigger trg_notifications_on_task
  after insert or update of owner_id on public.application_tasks
  for each row execute function public.notifications_on_task();

-- ------------------------------------------------------------------- leave
-- Decided, or recorded for someone by an approver. The leave mail already
-- tells them; this lists it.
create or replace function public.notifications_on_leave() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_dates text := to_char(new.start_date, 'FMDD Mon') ||
    case when new.end_date <> new.start_date then ' – ' || to_char(new.end_date, 'FMDD Mon YYYY') else ' ' || to_char(new.start_date, 'YYYY') end;
begin
  if tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('approved', 'rejected') then
    perform notify(new.staff_id, 'leave_decided', null,
      case when new.status = 'approved' then 'Leave approved: ' else 'Leave not approved: ' end || v_dates, null,
      new.decision_note, '/my-leave', null, null, true, false);
  elsif tg_op = 'INSERT' and new.created_by is distinct from new.staff_id and new.status <> 'pending' then
    perform notify(new.staff_id, 'leave_decided', null, 'Leave recorded for you: ' || v_dates, null,
      null, '/my-leave', null, null, true, false);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifications_on_leave on public.leave_requests;
create trigger trg_notifications_on_leave
  after insert or update of status on public.leave_requests
  for each row execute function public.notifications_on_leave();

-- ------------------------------------------------------- read, and emailed
-- Marks the caller's own alerts read: the ones named, or all they are shown.
-- "Mark all read" leaves the ones only emailed (feed = false) alone: those
-- stand for a to-do — a student waiting on a reply — and clear when it is
-- done, not when the news above it is dismissed.
create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns integer
language sql security definer set search_path = public as $$
  with done as (
    update notifications set read_at = now()
    where user_id = auth.uid() and read_at is null
      and (case when p_ids is null then feed else id = any (p_ids) end)
    returning 1
  )
  select count(*)::integer from done
$$;

revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- The alerts due an email, taken by one sender at a time: quiet for
-- p_quiet (a thread still being written to waits), not read in the portal
-- meanwhile, at most p_limit. One left half-sent for fifteen minutes is taken
-- again. Service role only — it reads the sign-in addresses.
create or replace function public.claim_notification_emails(p_limit integer default 20, p_quiet interval default interval '2 minutes')
returns table (id uuid, kind text, title text, title_many text, body text, link text, link_many text, count integer, email text, recipient_name text, audience text)
language plpgsql security definer set search_path = public, auth as $$
#variable_conflict use_column
begin
  -- Read in the portal first, or two days old (the mail was down, say):
  -- news that late is not worth an email.
  update notifications n set email_state = 'skipped'
  where n.email_state = 'pending' and (n.read_at is not null or n.updated_at < now() - interval '2 days');

  return query
  with picked as (
    select n.id from notifications n
    where n.read_at is null
      and ((n.email_state = 'pending' and n.updated_at <= now() - p_quiet)
        or (n.email_state = 'sending' and n.email_claimed_at <= now() - interval '15 minutes'))
    order by n.updated_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update notifications n set email_state = 'sending', email_claimed_at = now()
    from picked where n.id = picked.id
    returning n.id, n.user_id, n.kind, n.title, n.title_many, n.body, n.link, n.link_many, n.count
  )
  -- Staff at their office address, as the leave and agreement mails are;
  -- everyone else at the address they sign in with.
  select c.id, c.kind, c.title, c.title_many, c.body, c.link, c.link_many, c.count,
    coalesce(nullif(btrim(s.email_official), ''), u.email::text),
    coalesce(s.full_name, p.staff_name, l.full_name),
    case when s.id is not null then 'staff' when p.id is not null then 'partner' else 'student' end
  from claimed c
  join auth.users u on u.id = c.user_id
  left join staff s on s.id = c.user_id
  left join partner_university_accounts p on p.id = c.user_id
  left join leads l on l.auth_user_id = c.user_id;
end;
$$;

revoke execute on function public.claim_notification_emails(integer, interval) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(integer, interval) to service_role;
