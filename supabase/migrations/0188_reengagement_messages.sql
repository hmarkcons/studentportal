-- What we say to a student who has stopped.
--
-- 0186 and 0187 put a follow-up task on the counsellor's list when a student
-- goes quiet or withdraws. This is the other half: the message itself, written
-- once by the office rather than improvised by whoever is doing the chasing at
-- the time.
--
-- Two of them, because the two situations are not the same. A ghosted student
-- probably has not decided anything — the message assumes circumstance and
-- makes replying easy. A withdrawn student has decided, and a message that
-- tries to talk them out of it is how a consultancy gets a reputation; that
-- one exists to leave the door open and to offer to stop contacting them.
--
-- Never sent automatically. The draft is prepared and a person sends it — a
-- counsellor often marks a student ghosted immediately after a difficult phone
-- call, and an email going out by itself minutes later cannot be held back.
--
-- Singleton, the same shape as visa_messages (0177): one row, id fixed true.

create table if not exists public.reengagement_messages (
  id boolean primary key default true check (id),
  ghost_subject text not null,
  ghost_body text not null,
  withdrawn_subject text not null,
  withdrawn_body text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table public.reengagement_messages enable row level security;

-- Readable by any active staff member: whoever is chasing needs the wording.
drop policy if exists reengagement_messages_select on public.reengagement_messages;
create policy reengagement_messages_select on public.reengagement_messages
  for select using (is_active_staff());

-- Editing is gated in the app by settings.reengagement_messages, as every
-- other setting in this codebase is; the policy keeps it to staff.
drop policy if exists reengagement_messages_write on public.reengagement_messages;
create policy reengagement_messages_write on public.reengagement_messages
  for all
  using (has_role(array['counselor', 'management', 'super_admin']::staff_role[]))
  with check (has_role(array['counselor', 'management', 'super_admin']::staff_role[]));

insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
values (
  'settings.reengagement_messages',
  'Setup',
  'Edit the re-engagement messages',
  'Write what a student is sent when they go quiet or withdraw. The messages are never sent automatically — a counsellor reviews and sends each one.',
  '{management,super_admin}',
  (select coalesce(max(sort_order), 0) + 10 from public.permission_definitions)
)
on conflict (key) do update
  set category = excluded.category,
      label = excluded.label,
      description = excluded.description;

-- Seeded with wording the office can change. {name} is their first name and
-- {counsellor} is whoever holds them.
insert into public.reengagement_messages (id, ghost_subject, ghost_body, withdrawn_subject, withdrawn_body)
values (
  true,
  'Are you still thinking about studying abroad, {name}?',
  'Hello {name},

We have not been able to reach you for a little while, and rather than keep calling we thought we would write instead.

Nothing has been lost. Your documents are all still on your portal, and the applications we started are exactly where we left them — so if you want to carry on, we pick up from where we stopped rather than start again.

And if the timing has simply become difficult, that is very common. We can move you to a later intake instead, at no extra cost.

Just reply to this message, or send us a WhatsApp, and tell us which of those it is. One line is enough.

{counsellor}
HMARK Consultants',
  'If anything changes, {name}, we have kept everything',
  'Hello {name},

We were sorry to hear you have decided not to continue, and we respect that completely. This is not an attempt to change your mind.

We wanted you to know that everything you sent us is still on your portal, and it stays there. If your plans change in a few months, or in a few years, you would not be starting from nothing — and you would not be paying us again for work that is already done.

If you would rather we stopped contacting you altogether, reply with one word and we will.

We wish you well either way.

{counsellor}
HMARK Consultants'
)
on conflict (id) do nothing;
