-- The visa decision messages, editable by the office.
--
-- These are the only words in the portal that carry real news. They were
-- written into a source file, which meant the office could choose the wording
-- once — by asking me — and never again. A refusal message is exactly the kind
-- of thing a business wants to keep adjusting after watching a few students
-- read it.
--
-- A singleton, like attendance_policy: there is one house style, not one per
-- country. If that ever needs to differ by destination this table is where the
-- destination_id would go, and nothing above it would have to change.

create table if not exists public.visa_messages (
  id boolean primary key default true,
  approved_heading text not null,
  approved_body text not null,
  approved_signoff text not null,
  refused_heading text not null,
  refused_body text not null,
  refused_signoff text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff (id),
  constraint visa_messages_singleton check (id)
);

comment on table public.visa_messages is
  'What a student reads when their visa decision arrives. {name} and {country} are substituted; blank lines separate paragraphs.';

-- Empty is not a message. A heading nobody wrote leaves a card with a badge
-- and nothing under it, on the page a student opens to find out whether they
-- are going.
alter table public.visa_messages drop constraint if exists visa_messages_not_blank;
alter table public.visa_messages
  add constraint visa_messages_not_blank check (
    btrim(approved_heading) <> ''
    and btrim(approved_body) <> ''
    and btrim(refused_heading) <> ''
    and btrim(refused_body) <> ''
  );

alter table public.visa_messages enable row level security;

-- Students read their own message, so this is readable by any signed-in user.
-- It is copy written for them; there is nothing here to protect.
drop policy if exists visa_messages_select on public.visa_messages;
create policy visa_messages_select on public.visa_messages
  for select using (auth.role() = 'authenticated');

drop policy if exists visa_messages_write on public.visa_messages;
create policy visa_messages_write on public.visa_messages
  for all
  using (has_role(array['management', 'super_admin']::staff_role[]))
  with check (has_role(array['management', 'super_admin']::staff_role[]));

insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
values (
  'settings.visa_messages',
  'Setup',
  'Edit the visa decision messages',
  'Change what a student reads when their visa is approved or refused.',
  '{management,super_admin}',
  (select coalesce(max(sort_order), 0) + 10 from public.permission_definitions)
)
on conflict (key) do update
  set category = excluded.category,
      label = excluded.label,
      description = excluded.description;

-- The wording the office chose, seeded so the page reads the same the moment
-- this lands. Editing it afterwards is the point of the table.
insert into public.visa_messages (
  id, approved_heading, approved_body, approved_signoff,
  refused_heading, refused_body, refused_signoff
)
values (
  true,
  '🎉 Your visa has been issued',
  'Congratulations, {name} — it''s official. You''re going to {country}.

After everything you put into this application, take a moment to enjoy it. It has been a pleasure supporting you from the first document to this result, and the whole team wishes you every success in your studies.',
  'HMARK Consultants',
  'Your visa was not approved this time',
  '{name}, we''re sorry. We know how much you put into this, and a refusal is hard news to receive. Take a moment — it''s fair to feel that.

When you''re ready, we''re still here. It isn''t the end of the road: many students who apply again are successful, and a refusal reason is something that can be worked on rather than a closed door. We''ll look at it together, and if you''d like to try for the next intake, we''ll help you prepare from the start.

Nothing you''ve achieved so far is lost.',
  'The HMARK team'
)
on conflict (id) do nothing;
