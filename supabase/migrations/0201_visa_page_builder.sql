-- The visa page, assembled from blocks somebody can edit.
--
-- Until now the page was three fixed things in a fixed order: the decision
-- message, the tracker fields, and (since 0199) the offices. Anything else the
-- office wanted to tell a student about their visa — what to bring, how long
-- the wait is, that the centre has moved — had nowhere to go but a phone call.
--
-- Two additions, both deliberately additive so nothing that renders today
-- changes until somebody puts something in them.

-- ------------------------------------------------- sections anyone can add
-- destination_id null means every destination, so a rule that applies to all
-- of them is written once. A country's own sections show after the shared
-- ones, which is the order the office reads them in: general first, then
-- "and for Italy specifically".
create table if not exists public.visa_page_sections (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid references public.destinations (id) on delete cascade,
  title text not null,
  body text,
  /** An optional link out — a booking page, a checklist, a form. */
  link_label text,
  link_url text,
  /**
   * Who reads it. Some of this is guidance for the student; some is a note to
   * the counselor that would alarm a student to read.
   */
  audience text not null default 'both' check (audience in ('student', 'staff', 'both')),
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.visa_page_sections is
  'Free-form blocks shown on the visa page, per destination or shared across all of them. Built in Setup > Visa page builder.';
comment on column public.visa_page_sections.destination_id is
  'Null means every destination, including ones added later.';

create index if not exists visa_page_sections_dest_idx
  on public.visa_page_sections (destination_id, sort_order);

drop trigger if exists trg_visa_page_sections_updated_at on public.visa_page_sections;
create trigger trg_visa_page_sections_updated_at
  before update on public.visa_page_sections
  for each row execute function public.set_updated_at();

alter table public.visa_page_sections enable row level security;

drop policy if exists "visa_page_sections_select" on public.visa_page_sections;
create policy "visa_page_sections_select" on public.visa_page_sections
  for select using (auth.role() = 'authenticated');

drop policy if exists "visa_page_sections_write" on public.visa_page_sections;
create policy "visa_page_sections_write" on public.visa_page_sections
  for all
  using (has_role(array['management', 'super_admin']::staff_role[]))
  with check (has_role(array['management', 'super_admin']::staff_role[]));

-- ------------------------------------- a decision message for one country
-- visa_messages (0177) is a single pair of messages for every country. A
-- refusal in Italy and a refusal in the UK are not the same conversation, so a
-- destination can override any of the six fields. Every column is nullable:
-- an override that only changes the heading falls back to the shared wording
-- for the rest.
create table if not exists public.visa_destination_messages (
  destination_id uuid primary key references public.destinations (id) on delete cascade,
  approved_heading text,
  approved_body text,
  approved_signoff text,
  refused_heading text,
  refused_body text,
  refused_signoff text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.visa_destination_messages is
  'Per-country overrides for the visa decision message. Any column left null falls back to the shared wording in visa_messages.';

drop trigger if exists trg_visa_destination_messages_updated_at on public.visa_destination_messages;
create trigger trg_visa_destination_messages_updated_at
  before update on public.visa_destination_messages
  for each row execute function public.set_updated_at();

alter table public.visa_destination_messages enable row level security;

drop policy if exists "visa_destination_messages_select" on public.visa_destination_messages;
create policy "visa_destination_messages_select" on public.visa_destination_messages
  for select using (auth.role() = 'authenticated');

drop policy if exists "visa_destination_messages_write" on public.visa_destination_messages;
create policy "visa_destination_messages_write" on public.visa_destination_messages
  for all
  using (has_role(array['management', 'super_admin']::staff_role[]))
  with check (has_role(array['management', 'super_admin']::staff_role[]));

-- ------------------------------------------------------------- permission
insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
values (
  'settings.visa_page',
  'Setup',
  'Build the visa page',
  'Add and edit the sections, messages and office details that make up a student''s Visa page.',
  '{management,super_admin}',
  (select coalesce(max(sort_order), 0) + 10 from public.permission_definitions)
)
on conflict (key) do update
  set category = excluded.category,
      label = excluded.label,
      description = excluded.description;
