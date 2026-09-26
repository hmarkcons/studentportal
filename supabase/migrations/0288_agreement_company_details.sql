-- The company's name, address and contact details as agreements print them,
-- kept in one place and edited by the Super Admin alone.
--
-- Every agreement opens with an office line — "HMARK Consultants - Office
-- Address: … Landline #: …" — and carries the company's name in its page
-- header and under the consultant's signature. All of it was fixed in code,
-- in fourteen copies of the office line: one for the templates made in the
-- builder and staff agreements, and one per built-in Standard template. They
-- had drifted — Italy's printed the landline as 021 34 999 778.
--
-- One row now feeds every student and staff agreement. Each column starts at
-- exactly what the office line printed, so an agreement generated before
-- anyone edits this prints what it always did (Italy's apart, which prints
-- the same number as the rest).
--
-- Kept apart from invoice_settings on purpose: Finance may edit what an
-- invoice says (0286), but only the Super Admin may change what a contract
-- says. Agreements already generated are not touched — a PDF is rebuilt only
-- when somebody generates or regenerates it.

create table if not exists public.agreement_settings (
  id boolean primary key default true,
  company_name text not null default 'HMARK Consultants',
  office_address text not null
    default 'Suite 101, Dashtiyar Chambers, Opp. Urdu Federal University, Gulshan-e-Iqbal, Block 13-C, University Road, Karachi, Pakistan',
  landline text default '021 34 999 777',
  mobile text,
  email text,
  website text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint agreement_settings_singleton check (id),
  constraint agreement_settings_required check (btrim(company_name) <> '' and btrim(office_address) <> ''),
  constraint agreement_settings_email check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+$')
);

insert into public.agreement_settings (id) values (true) on conflict do nothing;

drop trigger if exists trg_agreement_settings_updated_at on public.agreement_settings;
create trigger trg_agreement_settings_updated_at
  before update on public.agreement_settings
  for each row execute function set_updated_at();

alter table public.agreement_settings enable row level security;

-- Any active staff member may read it: whoever generates an agreement prints it.
drop policy if exists "staff read agreement settings" on public.agreement_settings;
create policy "staff read agreement settings" on public.agreement_settings
  for select using (is_active_staff());

drop policy if exists "super admin writes agreement settings" on public.agreement_settings;
create policy "super admin writes agreement settings" on public.agreement_settings
  for update using (has_role(array['super_admin']::staff_role[]))
  with check (has_role(array['super_admin']::staff_role[]));

comment on table public.agreement_settings is
  'The company name, address and contacts every agreement prints (0288). Super Admin only.';

notify pgrst, 'reload schema';
