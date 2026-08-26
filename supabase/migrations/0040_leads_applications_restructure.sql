-- CRM overhaul step 1: multi-destination leads, registration status,
-- discounts, and the extra application/program/task fields needed for the
-- reworked registered-student pages.

-- ---------------------------------------------------------------------------
-- Multi-destination selection for leads/students. country_of_interest stays
-- (free-text, back-compat display) but new UI writes here instead.
-- ---------------------------------------------------------------------------

create table lead_destinations (
  lead_id uuid not null references leads (id) on delete cascade,
  destination_id uuid not null references destinations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lead_id, destination_id)
);

create index lead_destinations_destination_idx on lead_destinations (destination_id);

alter table leads
  add column registration_status text not null default 'registered'
    check (registration_status in ('registered', 'withdrawn', 'ghost')),
  add column discount_amount numeric(10, 2),
  add column discount_reason text;

alter table applications
  add column deadline date,
  add column application_fee numeric(10, 2),
  add column special_requirements text;

alter table programs
  add column requirements_link text;

alter table universities
  add column contact_email text;

alter table application_tasks
  add column priority text not null default 'medium' check (priority in ('urgent', 'medium', 'low'));

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table lead_destinations enable row level security;

create policy "lead_destinations_select" on lead_destinations for select
  using (staff_can_view_student(lead_id) or is_own_student(lead_id));
create policy "lead_destinations_write" on lead_destinations for all
  using (staff_can_view_student(lead_id))
  with check (staff_can_view_student(lead_id));
