-- HMARK CRM rebuild — step 4: Setup > Destination/University, and the
-- University & Course Database (Module 1C / 1C2).
-- Run after 0007_leads.sql.

create type destination_track as enum ('public', 'private');

-- Standard default application pipeline (Module 1D) — destinations can
-- override this per-country via the pipeline_stages column below.
create table destinations (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  country_code varchar(2) not null,
  track destination_track not null,
  display_name text not null,
  currency text not null,
  visa_type text,
  intake_seasons text[] not null default '{}',
  agreement_template_id uuid, -- FK added in 0010 once agreement_templates exists
  language_requirements jsonb not null default '{}'::jsonb, -- e.g. {"bachelors":"B2","masters":"B2","phd":"C1"}
  min_applications int,
  status text not null default 'active' check (status in ('active', 'inactive')),
  pipeline_stages jsonb not null default '[
    "documents_pending", "documents_verified", "application_submitted", "under_review",
    "conditional_offer_received", "unconditional_offer_received", "offer_accepted",
    "visa_documentation_in_progress", "visa_filed", "visa_interview_scheduled",
    "visa_granted", "enrolled"
  ]'::jsonb,
  admin_charge numeric(10, 2) not null default 0,
  consultancy_fee numeric(12, 2) not null default 0,
  consultancy_fee_currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_code, track)
);

drop trigger if exists trg_destinations_updated_at on destinations;
create trigger trg_destinations_updated_at
  before update on destinations
  for each row execute function set_updated_at();

create table universities (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations (id) on delete cascade,
  name text not null,
  type destination_track not null,
  logo_path text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  levels_offered text[] not null default '{}', -- subset of bachelors/masters/phd
  fields_offered text[] not null default '{}', -- Engineering, IT/CS, Health Sciences, Social Sciences, Media Sciences
  tuition_fee_requirement text not null default 'none'
    check (tuition_fee_requirement in ('none', 'enrollment_fee_only', 'tuition_due_on_arrival')),
  tuition_fee_timing text check (tuition_fee_timing in ('on_offer_acceptance', 'on_arrival')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_universities_updated_at on universities;
create trigger trg_universities_updated_at
  before update on universities
  for each row execute function set_updated_at();

-- Program Directory taxonomy: Level -> Core Field -> Sub-field -> Program Name
create table programs (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities (id) on delete cascade,
  level text not null check (level in ('bachelors', 'masters', 'phd')),
  core_field text,
  sub_field text,
  name text not null,
  page_link text,
  interview_required boolean not null default false,
  interview_details text,
  admission_test_required boolean not null default false,
  admission_test_type text, -- e.g. TOLC/IMAT/SAT
  requirements_checklist jsonb not null default '[]'::jsonb,
  application_portal_name text,
  application_portal_link text,
  intake_dates text[] not null default '{}',
  application_deadline date,
  tuition_fee numeric(12, 2),
  duration text,
  language_requirement text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_programs_updated_at on programs;
create trigger trg_programs_updated_at
  before update on programs
  for each row execute function set_updated_at();

-- Commission rate: visible only to Finance/Management/Super Admin, editable
-- only by Finance/Super Admin — split into its own table since RLS is
-- row-level, not column-level (see plan decision #7).
create table program_commission_rates (
  program_id uuid primary key references programs (id) on delete cascade,
  rate_percent numeric(5, 2),
  fixed_amount numeric(12, 2),
  currency text not null default 'EUR',
  updated_by uuid references staff (id),
  updated_at timestamptz not null default now(),
  constraint chk_rate_or_fixed check (rate_percent is not null or fixed_amount is not null)
);

drop trigger if exists trg_program_commission_rates_updated_at on program_commission_rates;
create trigger trg_program_commission_rates_updated_at
  before update on program_commission_rates
  for each row execute function set_updated_at();

drop trigger if exists trg_audit_program_commission_rates on program_commission_rates;
create trigger trg_audit_program_commission_rates
  after insert or update or delete on program_commission_rates
  for each row execute function log_audit_event();

-- ---------------------------------------------------------------------------
-- Row Level Security — "any staff role can add/edit" per the doc, except
-- commission rates, which stay tightly scoped.
-- ---------------------------------------------------------------------------

alter table destinations enable row level security;
alter table universities enable row level security;
alter table programs enable row level security;
alter table program_commission_rates enable row level security;

create policy "destinations_select" on destinations for select using (is_active_staff());
create policy "destinations_write" on destinations for all
  using (is_active_staff()) with check (is_active_staff());

create policy "universities_select" on universities for select using (is_active_staff());
create policy "universities_write" on universities for all
  using (is_active_staff()) with check (is_active_staff());

create policy "programs_select" on programs for select using (is_active_staff());
create policy "programs_write" on programs for all
  using (is_active_staff()) with check (is_active_staff());

create policy "program_commission_rates_select" on program_commission_rates for select
  using (has_role(array['finance', 'management', 'super_admin']::staff_role[]));
create policy "program_commission_rates_write" on program_commission_rates for all
  using (has_role(array['finance', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'super_admin']::staff_role[]));
