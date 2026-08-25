-- HMARK CRM rebuild — step 3: Lead & Inquiry Management (Module 1A).
-- `leads` is also the base table for registered students (see 0009) — a
-- lead's row gains registration columns in place once status = 'registered',
-- rather than being copied into a separate table (see plan decision #8).
-- Run after 0006_roles_and_staff.sql.

create type lead_status as enum (
  'registered', 'potential', 'meeting_done', 'repeated_reschedules',
  'in_discussion', 'not_answering', 'powered_off', 'next_intake',
  'not_interested', 'not_eligible'
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  date_of_inquiry date not null default current_date,
  platform_source text,
  full_name text not null,
  contact_number text,
  email text,
  current_qualification text,
  level_applying_for text check (level_applying_for in ('bachelors', 'masters', 'phd')),
  course_of_interest text,
  country_of_interest text,
  assigned_counselor_id uuid references staff (id),
  status lead_status not null default 'potential',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_contact_number_idx on leads (contact_number);
create index leads_email_idx on leads (email);
create index leads_assigned_counselor_idx on leads (assigned_counselor_id);

drop trigger if exists trg_leads_updated_at on leads;
create trigger trg_leads_updated_at
  before update on leads
  for each row execute function set_updated_at();

drop trigger if exists trg_audit_leads on leads;
create trigger trg_audit_leads
  after update or delete on leads
  for each row execute function log_audit_event();

-- ---------------------------------------------------------------------------
-- Call log (mandatory after every telephonic conversation with a lead)
-- ---------------------------------------------------------------------------

create table lead_call_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  counselor_id uuid references staff (id),
  status_at_time lead_status not null,
  remark text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Shared visibility helpers, reused by every downstream student-scoped table
-- ---------------------------------------------------------------------------

-- Note: is_own_student() is defined in 0009, once leads.auth_user_id exists
-- (a `language sql` function body is validated against the schema at
-- CREATE time, so it can't reference that column before it's added).

-- True if the current staff user can see this lead/student: their assigned
-- counselor, or Management/Super Admin/Processing/Finance (the roles that
-- work with a student post-registration per the ownership handoff rule).
create or replace function staff_can_view_student(p_student_id uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from leads l
    where l.id = p_student_id
      and (
        l.assigned_counselor_id = auth.uid()
        or has_role(array['management', 'super_admin', 'processing', 'finance']::staff_role[])
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table leads enable row level security;
alter table lead_call_logs enable row level security;

-- Leads: assigned counselor, Management/Super Admin (who assign leads), and
-- Marketing/Digital Marketing (lead-source & campaign reporting) can see them.
create policy "leads_select" on leads for select
  using (
    assigned_counselor_id = auth.uid()
    or has_role(array['management', 'super_admin', 'marketing', 'digital_marketing']::staff_role[])
  );
create policy "leads_insert" on leads for insert
  with check (is_active_staff());
create policy "leads_update" on leads for update
  using (
    assigned_counselor_id = auth.uid()
    or has_role(array['management', 'super_admin']::staff_role[])
  );
create policy "leads_delete" on leads for delete
  using (has_role(array['management', 'super_admin']::staff_role[]));

create policy "lead_call_logs_select" on lead_call_logs for select
  using (exists (
    select 1 from leads l
    where l.id = lead_call_logs.lead_id
      and (
        l.assigned_counselor_id = auth.uid()
        or has_role(array['management', 'super_admin']::staff_role[])
      )
  ));
create policy "lead_call_logs_insert" on lead_call_logs for insert
  with check (is_active_staff());
