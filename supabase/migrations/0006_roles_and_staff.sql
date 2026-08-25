-- HMARK CRM rebuild — step 2: staff roles, shared helper functions, login/audit tracking.
-- Run after 0005_reset_schema.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------

create type staff_role as enum (
  'super_admin', 'management', 'counselor', 'processing', 'finance',
  'marketing', 'digital_marketing'
);

create type staff_status as enum ('active', 'suspended', 'deactivated');

create table staff (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role staff_role not null,
  status staff_status not null default 'active',
  photo_path text,
  designation text,
  phone text,
  whatsapp_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Shared helper functions (reused by every migration from here on)
-- ---------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- security-definer avoids recursive RLS checks against `staff` itself
create or replace function has_role(roles staff_role[]) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from staff where id = auth.uid() and status = 'active' and role = any(roles)
  );
$$;

create or replace function is_active_staff() returns boolean
language sql security definer stable as $$
  select exists (select 1 from staff where id = auth.uid() and status = 'active');
$$;

create or replace function is_super_admin() returns boolean
language sql security definer stable as $$
  select has_role(array['super_admin']::staff_role[]);
$$;

-- Generic audit-log trigger body, attached selectively to sensitive tables
-- (staff role/status changes here; commission-rate changes, document
-- approvals/rejections, and student-record edits are wired up in the
-- migrations that create those tables).
create or replace function log_audit_event() returns trigger
language plpgsql security definer as $$
begin
  insert into audit_log (actor_id, action_type, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_staff_updated_at on staff;
create trigger trg_staff_updated_at
  before update on staff
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Login tracking (per-login IP, per doc: "Super Admin can see whether a
-- staff member logged in from the office network or elsewhere")
-- ---------------------------------------------------------------------------

create table login_events (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff (id) on delete cascade,
  ip_address text,
  logged_in_at timestamptz not null default now(),
  logged_out_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Audit log (append-only; before/after snapshots via to_jsonb)
-- ---------------------------------------------------------------------------

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references staff (id),
  action_type text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

drop trigger if exists trg_audit_staff on staff;
create trigger trg_audit_staff
  after insert or update or delete on staff
  for each row execute function log_audit_event();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table staff enable row level security;
alter table login_events enable row level security;
alter table audit_log enable row level security;

-- staff: everyone reads their own row; Super Admin and Management read all.
-- Only Super Admin creates/edits/deactivates staff accounts (per doc).
create policy "staff_select" on staff for select
  using (id = auth.uid() or has_role(array['super_admin', 'management']::staff_role[]));
create policy "staff_write" on staff for all
  using (is_super_admin()) with check (is_super_admin());

-- login_events: staff can log their own login/logout; only Super Admin reviews them.
create policy "login_events_select" on login_events for select
  using (is_super_admin());
create policy "login_events_insert" on login_events for insert
  with check (staff_id = auth.uid());
create policy "login_events_update_own" on login_events for update
  using (staff_id = auth.uid());

-- audit_log: append-only, Super Admin-visible.
create policy "audit_log_select" on audit_log for select
  using (is_super_admin());
create policy "audit_log_insert" on audit_log for insert
  with check (true); -- populated only via security-definer triggers/functions
