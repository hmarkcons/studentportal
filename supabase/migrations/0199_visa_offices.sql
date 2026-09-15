-- Where a Pakistani student actually lodges a study visa application.
--
-- Three different things, and which one matters depends on the country:
--
--   embassy / high commission — the mission itself. For some countries this
--     is also where the application is handed in, because there is no centre
--     between the student and the consular section;
--   consulate — a second office, usually Karachi, with its own jurisdiction.
--     A student in Sindh going to the Islamabad embassy is turned away;
--   visa centre — BLS, VFS Global, TLScontact, Gerry's. Where the paperwork
--     and biometrics are actually taken for most European countries. Italy's
--     study visas go to BLS, not to the embassy.
--
-- submits_applications is the field that answers the student's real question,
-- and it is deliberately not derivable from kind: some embassies take
-- applications directly and some centres only do biometrics.
create table if not exists public.visa_offices (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations (id) on delete cascade,
  kind text not null check (kind in ('embassy', 'high_commission', 'consulate', 'visa_centre')),
  name text not null,
  city text,
  /** BLS International, VFS Global, TLScontact, Gerry's — for a centre. */
  operator text,
  address text,
  phone text,
  email text,
  website text,
  appointment_url text,
  office_hours text,
  /** Which provinces this office serves; a student outside it is sent away. */
  jurisdiction text,
  /** True where the study visa application is lodged here. */
  submits_applications boolean not null default false,
  notes text,
  /** Where this was read from, so it can be rechecked when it moves. */
  source_url text,
  /** When somebody last confirmed it against that source. */
  verified_at timestamptz,
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.visa_offices is
  'Embassies, consulates and visa application centres in Pakistan, per destination. Shown to staff and to the student on their Visa page.';
comment on column public.visa_offices.submits_applications is
  'The study visa application is lodged here. Not derivable from kind: some embassies take applications directly, and some centres only collect biometrics.';
comment on column public.visa_offices.verified_at is
  'When this entry was last checked against source_url. Null means nobody has confirmed it — the page says so rather than presenting it as fact.';

create index if not exists visa_offices_destination_idx
  on public.visa_offices (destination_id, sort_order);

-- One office of a kind per city per destination, so re-running a seed or
-- pasting a duplicate cannot leave a student choosing between two addresses.
create unique index if not exists visa_offices_one_per_city
  on public.visa_offices (destination_id, kind, coalesce(city, ''), coalesce(operator, ''));

drop trigger if exists trg_visa_offices_updated_at on public.visa_offices;
create trigger trg_visa_offices_updated_at
  before update on public.visa_offices
  for each row execute function public.set_updated_at();

alter table public.visa_offices enable row level security;

-- Readable by anyone signed in: a student needs the address of the centre
-- they are being sent to, and this is public information in any case.
drop policy if exists "visa_offices_select" on public.visa_offices;
create policy "visa_offices_select" on public.visa_offices
  for select using (auth.role() = 'authenticated');

-- Maintained in Setup by a Super Admin. A wrong address here sends a student
-- to the wrong city on the morning of their appointment.
drop policy if exists "visa_offices_write" on public.visa_offices;
create policy "visa_offices_write" on public.visa_offices
  for all
  using (is_super_admin())
  with check (is_super_admin());
