-- Email campaigns, part 2: the audience.
--
-- Who a campaign may go to is read from the portal's own records — every lead
-- with an email, students included — and never copied. What is added here is
-- what email needs on top:
--
--   email_contact_status  One row per email address: subscribed, unsubscribed,
--                         bounced, complained, suppressed (by staff) or
--                         invalid; where consent came from; the topics they
--                         chose on the preference page; and the private token
--                         their preference and unsubscribe links carry. Keyed
--                         by the address, so a person on two lead records is
--                         one subscriber, and suppression always wins. An
--                         address with no row is a lead who enquired: consent
--                         "Enquiry", subscribed to everything. It sits in its
--                         own staff-only table because a student can read
--                         their own leads row (0022).
--   email_contacts        People who are not leads — a list from an education
--                         expo, say — imported from a spreadsheet. Kept apart
--                         so they never appear in counsellors' lead lists.
--   email_lists           Static lists, and their members (a lead or an
--                         imported contact).
--   email_segments        Saved filters on the portal's fields, evaluated when
--                         used, so their members follow the records.
--
-- Permission (seeded; retuned in Admin › Role Permissions):
--   email.audience.manage — segments, lists, imports, the do-not-email list.

-- 1 ------------------------------------------------------- an address's state
create table if not exists public.email_contact_status (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  status text not null default 'subscribed'
    check (status in ('subscribed', 'unsubscribed', 'bounced', 'complained', 'suppressed', 'invalid')),
  -- In words: "Unsubscribed from the preference page", "Mailbox does not exist", "Added by staff: asked by phone".
  status_reason text,
  status_changed_at timestamptz not null default now(),
  consent_source text,
  consent_at timestamptz,
  -- Topics chosen on the preference page; empty means every topic.
  topics text[] not null default '{}',
  -- The private token in this address's preference and unsubscribe links.
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  soft_bounce_count integer not null default 0,
  last_engaged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_contact_status_status on public.email_contact_status (status) where status <> 'subscribed';

-- 2 ------------------------------------------------- people who are not leads
create table if not exists public.email_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  full_name text check (full_name is null or char_length(full_name) <= 200),
  country_of_interest text check (country_of_interest is null or char_length(country_of_interest) <= 200),
  city text check (city is null or char_length(city) <= 120),
  intake text check (intake is null or char_length(intake) <= 120),
  -- Which import brought them, in words.
  source text check (source is null or char_length(source) <= 200),
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3 ---------------------------------------------------------------- lists
create table if not exists public.email_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_list_members (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.email_lists (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  contact_id uuid references public.email_contacts (id) on delete cascade,
  added_by uuid references public.staff (id) on delete set null,
  added_at timestamptz not null default now(),
  constraint email_list_members_one check ((lead_id is null) <> (contact_id is null))
);
create unique index if not exists email_list_members_lead on public.email_list_members (list_id, lead_id) where lead_id is not null;
create unique index if not exists email_list_members_contact on public.email_list_members (list_id, contact_id) where contact_id is not null;

-- 4 ---------------------------------------------------------------- segments
create table if not exists public.email_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  -- {"match": "all" | "any", "rules": [{"field", "op", "value"}]} — see src/lib/emailCampaigns/audience.ts.
  rules jsonb not null default '{"match":"all","rules":[]}'::jsonb,
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5 ------------------------------------------------- topics on the preference page
alter table public.email_settings
  add column if not exists topics jsonb not null default
    '[{"key":"italy","label":"Studying in Italy"},{"key":"germany","label":"Studying in Germany"},{"key":"austria","label":"Studying in Austria"},{"key":"hungary","label":"Studying in Hungary"},{"key":"nordics","label":"Studying in Sweden and Finland"},{"key":"france","label":"Studying in France"},{"key":"scholarships","label":"Scholarships"},{"key":"events","label":"Events and webinars"}]'::jsonb;

-- 6 ---------------------------------------------------------------- stamps
drop trigger if exists trg_email_contact_status_updated_at on public.email_contact_status;
create trigger trg_email_contact_status_updated_at before update on public.email_contact_status
  for each row execute function set_updated_at();
drop trigger if exists trg_email_contacts_updated_at on public.email_contacts;
create trigger trg_email_contacts_updated_at before update on public.email_contacts
  for each row execute function set_updated_at();
drop trigger if exists trg_email_lists_updated_at on public.email_lists;
create trigger trg_email_lists_updated_at before update on public.email_lists
  for each row execute function set_updated_at();
drop trigger if exists trg_email_segments_updated_at on public.email_segments;
create trigger trg_email_segments_updated_at before update on public.email_segments
  for each row execute function set_updated_at();

-- 7 ---------------------------------------------------------------- who may
alter table public.email_contact_status enable row level security;
alter table public.email_contacts enable row level security;
alter table public.email_lists enable row level security;
alter table public.email_list_members enable row level security;
alter table public.email_segments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['email_contact_status', 'email_contacts', 'email_lists', 'email_list_members', 'email_segments'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using ((select public.staff_has_permission(''page.marketing.email'')))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all using ((select public.staff_has_permission(''email.audience.manage''))) with check ((select public.staff_has_permission(''email.audience.manage'')))',
      t || '_write', t
    );
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_' || t, t);
  end loop;
end $$;

-- History, so a change can be seen and undone (0322). Keyed by each table's primary key.
create trigger trg_audit_email_contact_status after insert or update or delete on public.email_contact_status
  for each row execute function public.log_audit_event('email');
create trigger trg_audit_email_contacts after insert or update or delete on public.email_contacts
  for each row execute function public.log_audit_event('id');
create trigger trg_audit_email_lists after insert or update or delete on public.email_lists
  for each row execute function public.log_audit_event('id');
create trigger trg_audit_email_list_members after insert or update or delete on public.email_list_members
  for each row execute function public.log_audit_event('id');
create trigger trg_audit_email_segments after insert or update or delete on public.email_segments
  for each row execute function public.log_audit_event('id');

-- 8 ---------------------------------------------------------------- permission
with base as (select coalesce(max(sort_order), 0) as m from public.permission_definitions)
insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
select v.key, v.category, v.label, v.description, v.default_roles, base.m + v.ord
from base, (values
  ('email.audience.manage', 'Email campaigns', 'Manage the email audience', 'Create segments and lists, import contacts from a spreadsheet, and keep the do-not-email list.', array['marketing', 'digital_marketing']::staff_role[], 10)
) as v(key, category, label, description, default_roles, ord)
on conflict (key) do update set category = excluded.category, label = excluded.label, description = excluded.description;

notify pgrst, 'reload schema';
