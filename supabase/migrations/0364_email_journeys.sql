-- Email campaigns, Phase 6 (fourth part): automations — journeys of emails
-- that start by themselves when something happens in the portal.
--
-- Each email of a journey is a step; each step sends through a campaign of
-- its own (kind 'automation'), so the sender, tracking, unsubscribes and
-- reports work for it exactly as for any campaign. People join a journey as
-- an enrolment, anchored to what started it (their enquiry, the stage, the
-- appointment), and move through its steps as they fall due.

-- 1 ------------------------------------------------- automation campaigns
alter table public.email_campaigns
  add column if not exists kind text not null default 'campaign' check (kind in ('campaign', 'automation'));
create index if not exists email_campaigns_kind on public.email_campaigns (kind, created_at desc);

-- 2 -------------------------------------------------------------- journeys
create table if not exists public.email_journeys (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  trigger text not null check (trigger in ('new_lead', 'application_stage', 'missing_documents', 'visa_appointment', 'interview')),
  -- application_stage: {"stages": [keys]}.
  trigger_config jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  topic text,
  -- The first switch-on: a welcome series greets leads who enquire from then on, never the backlog.
  activated_at timestamptz,
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_journey_steps (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.email_journeys (id) on delete cascade,
  position integer not null check (position between 1 and 10),
  -- Days after the start, or before the appointment (negative).
  day integer not null check (day between -60 and 365),
  condition text not null default 'always' check (condition in ('always', 'opened_previous', 'not_opened_previous', 'clicked_previous', 'not_clicked_previous')),
  subject text not null check (char_length(subject) between 1 and 200),
  preheader text check (preheader is null or char_length(preheader) <= 250),
  template_version_id uuid references public.email_template_versions (id) on delete set null,
  -- The campaign it sends through, made when the journey is switched on (and remade if the email changed).
  campaign_id uuid references public.email_campaigns (id) on delete set null,
  unique (journey_id, position)
);

create table if not exists public.email_journey_enrolments (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.email_journeys (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  email text not null,
  -- What started it, and when: the enquiry, the stage, the appointment.
  anchor_at timestamptz not null,
  anchor_ref text not null,
  enrolled_at timestamptz not null default now(),
  next_position integer not null default 1,
  status text not null default 'active' check (status in ('active', 'completed', 'exited')),
  exit_reason text,
  updated_at timestamptz not null default now(),
  unique (journey_id, lead_id, anchor_ref)
);
create index if not exists email_journey_enrolments_active on public.email_journey_enrolments (journey_id, status) where status = 'active';

drop trigger if exists trg_email_journeys_updated_at on public.email_journeys;
create trigger trg_email_journeys_updated_at before update on public.email_journeys
  for each row execute function set_updated_at();
drop trigger if exists trg_email_journey_enrolments_updated_at on public.email_journey_enrolments;
create trigger trg_email_journey_enrolments_updated_at before update on public.email_journey_enrolments
  for each row execute function set_updated_at();

alter table public.email_journeys enable row level security;
alter table public.email_journey_steps enable row level security;
alter table public.email_journey_enrolments enable row level security;

drop policy if exists email_journeys_read on public.email_journeys;
create policy email_journeys_read on public.email_journeys for select
  using ((select public.staff_has_permission('page.marketing.email')));
drop policy if exists email_journeys_write on public.email_journeys;
create policy email_journeys_write on public.email_journeys for all
  using ((select public.staff_has_permission('email.campaigns.create')))
  with check ((select public.staff_has_permission('email.campaigns.create')));

drop policy if exists email_journey_steps_read on public.email_journey_steps;
create policy email_journey_steps_read on public.email_journey_steps for select
  using ((select public.staff_has_permission('page.marketing.email')));
drop policy if exists email_journey_steps_write on public.email_journey_steps;
create policy email_journey_steps_write on public.email_journey_steps for all
  using ((select public.staff_has_permission('email.campaigns.create')))
  with check ((select public.staff_has_permission('email.campaigns.create')));

-- Enrolments are written by the engine (service role) only.
drop policy if exists email_journey_enrolments_read on public.email_journey_enrolments;
create policy email_journey_enrolments_read on public.email_journey_enrolments for select
  using ((select public.staff_has_permission('page.marketing.email')));

drop trigger if exists trg_audit_email_journeys on public.email_journeys;
create trigger trg_audit_email_journeys after insert or update or delete on public.email_journeys
  for each row execute function public.log_audit_event('id');
drop trigger if exists trg_audit_email_journey_steps on public.email_journey_steps;
create trigger trg_audit_email_journey_steps after insert or update or delete on public.email_journey_steps
  for each row execute function public.log_audit_event('id');

create or replace function public.audit_excluded(p_table text) returns boolean
language sql immutable as $$
  select p_table = any (array[
    'audit_log', 'notifications', 'notification_reminders', 'login_events', 'invoice_email_log',
    'student_intake_counters', 'invoice_number_counters', 'student_code_holds',
    'staff_login_credentials', 'partner_login_credentials', 'encrypted_credentials',
    'application_interview_credentials', 'office_qr_tokens', 'scholarship_body_update_runs',
    'message_read_markers', 'support_ticket_read_markers', 'trashed_files',
    'calendar_invites', 'calendar_reminder_log', 'student_gmail_recovery',
    'student_welcome_emails',
    'email_campaign_recipients', 'email_campaign_links', 'email_events',
    'email_activity_log', 'email_journey_enrolments'
  ])
$$;

-- 3 ------------------------------------------------- who a trigger starts for
-- One function, read by the engine through the service role: for a trigger,
-- the leads it starts for now, when (the anchor), and what started it (a
-- reference that is the same each run, so nobody joins twice for one thing).
--   new_lead            leads who enquired since the journey was switched on
--                       and are not registered, not interested or not eligible
--   application_stage   an application that reached one of the stages (and
--                       is still there), in the last 14 days
--   missing_documents   registered students owing a required document
--                       (missing, or sent back) — one round per 60 days
--   visa_appointment    a visa appointment date from today to p_horizon days,
--                       at 09:00 Karachi (the tracker keeps the date only)
--   interview           a scheduled interview from now to p_horizon days
create or replace function public.email_journey_candidates(p_trigger text, p_since timestamptz, p_config jsonb, p_horizon integer default 61)
returns table (lead_id uuid, anchor_at timestamptz, anchor_ref text)
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_trigger = 'new_lead' then
    return query
      select l.id, l.created_at, 'lead'::text
      from leads l
      where l.created_at >= coalesce(p_since, now())
        and coalesce(btrim(l.email), '') <> ''
        and l.status::text not in ('registered', 'not_interested', 'not_eligible');
  elsif p_trigger = 'application_stage' then
    return query
      select distinct on (a.id, h.stage) a.student_id, h.entered_at, ('app:' || a.id || ':' || h.stage)::text
      from application_stage_history h
      join applications a on a.id = h.application_id
      where h.entered_at >= greatest(coalesce(p_since, now()), now() - interval '14 days')
        and h.stage in (select jsonb_array_elements_text(coalesce(p_config -> 'stages', '[]'::jsonb)))
        and a.current_stage = h.stage
      order by a.id, h.stage, h.entered_at desc;
  elsif p_trigger = 'missing_documents' then
    return query
      select d.student_id, now(), ('docs:' || floor(extract(epoch from now()) / 86400 / 60)::bigint)::text
      from student_documents d
      join leads l on l.id = d.student_id
      left join document_templates t on t.id = d.template_id
      where l.registered_at is not null
        and d.status in ('missing', 'rejected')
        and coalesce(t.required, true)
      group by d.student_id;
  elsif p_trigger = 'visa_appointment' then
    return query
      with v as (
        select a.student_id, a.id as app, x.field_value as d,
               case when x.field_value ~ '^\d{4}-\d{2}-\d{2}$' then x.field_value::date end as on_date
        from application_country_extra x
        join applications a on a.id = x.application_id
        where x.field_key = 'visa_appointment_date'
           or x.field_key in (select td.field_key from tracker_definitions td where td.is_appointment and td.field_key ilike '%visa%')
      )
      select distinct on (v.student_id, v.on_date) v.student_id, ((v.on_date + time '09:00') at time zone 'Asia/Karachi'), ('visa:' || v.app || ':' || v.d)::text
      from v
      where v.on_date is not null
        and v.on_date between (now() at time zone 'Asia/Karachi')::date and (now() at time zone 'Asia/Karachi')::date + p_horizon
      order by v.student_id, v.on_date, v.app;
  elsif p_trigger = 'interview' then
    return query
      select a.student_id, i.confirmed_datetime, ('interview:' || i.id || ':' || floor(extract(epoch from i.confirmed_datetime))::bigint)::text
      from application_interviews i
      join applications a on a.id = i.application_id
      where i.confirmed_datetime is not null
        and i.status in ('scheduled', 'rescheduled')
        and i.confirmed_datetime > now()
        and i.confirmed_datetime <= now() + make_interval(days => p_horizon);
  end if;
end;
$$;

-- The students among these who still owe a required document.
create or replace function public.email_journey_owing(p_lead_ids uuid[])
returns table (lead_id uuid)
language sql stable security invoker set search_path = public as $$
  select distinct d.student_id
  from student_documents d
  left join document_templates t on t.id = d.template_id
  where d.student_id = any (p_lead_ids)
    and d.status in ('missing', 'rejected')
    and coalesce(t.required, true)
$$;

revoke execute on function public.email_journey_candidates(text, timestamptz, jsonb, integer) from public, anon, authenticated;
revoke execute on function public.email_journey_owing(uuid[]) from public, anon, authenticated;

notify pgrst, 'reload schema';
