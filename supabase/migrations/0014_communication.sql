-- HMARK CRM rebuild — step 10: Communication Tools (Module 1G), plus the
-- student-facing two-way notes thread (Module 2G).
-- Run after 0013_finance_commission.sql.
-- Note: university-side messaging (entity_type = 'university') is read/write
-- only for staff until 0016 adds the matching partner-account policies.

create table messages (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('student', 'university')),
  entity_id uuid not null,
  channel text not null check (channel in ('email', 'sms', 'whatsapp', 'inapp', 'internal_note')),
  direction text not null default 'outbound' check (direction in ('inbound', 'outbound')),
  body text not null,
  sent_by uuid references staff (id),
  sent_at timestamptz not null default now(),
  delivery_status text not null default 'queued' check (
    delivery_status in ('queued', 'sent', 'delivered', 'read', 'failed')
  ),
  created_at timestamptz not null default now()
);

create index messages_entity_idx on messages (entity_type, entity_id);

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  purpose text not null,
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  subject text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_message_templates_updated_at on message_templates;
create trigger trg_message_templates_updated_at
  before update on message_templates
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table messages enable row level security;
alter table message_templates enable row level security;

-- Staff see everything for a student they can view, or any university
-- thread; students see their own thread but never internal_note messages.
create policy "messages_select_staff" on messages for select
  using (
    (entity_type = 'student' and staff_can_view_student(entity_id))
    or (entity_type = 'university' and is_active_staff())
  );
create policy "messages_select_own_student" on messages for select
  using (entity_type = 'student' and is_own_student(entity_id) and channel <> 'internal_note');

create policy "messages_insert_staff" on messages for insert
  with check (
    (entity_type = 'student' and staff_can_view_student(entity_id))
    or (entity_type = 'university' and is_active_staff())
  );
-- A student may reply on their own notes thread only (inapp, inbound).
create policy "messages_insert_own_student" on messages for insert
  with check (
    entity_type = 'student' and is_own_student(entity_id) and channel = 'inapp' and direction = 'inbound'
  );

create policy "message_templates_select" on message_templates for select using (is_active_staff());
create policy "message_templates_write" on message_templates for all
  using (is_active_staff()) with check (is_active_staff());
