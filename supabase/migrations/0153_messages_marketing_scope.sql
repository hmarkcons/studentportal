-- A marketing user could read every student's private thread, internal staff
-- notes included.
--
-- messages_select_staff allowed a student's messages to anyone who could view
-- the student OR held the marketing / digital_marketing role — and unlike the
-- student's own policy, that branch carried no channel restriction. So the
-- notes written under a heading that says "Staff-only — never visible to the
-- student" were readable by staff with no involvement in that student at all.
--
-- Verified against production before this was written, with a marketing user's
-- own session: 4 of 4 messages returned, including both internal notes and both
-- private counsellor messages, for students they cannot otherwise open.
--
-- The grant existed so the Broadcast page would work, but that page reads
-- `students` and `message_templates` — never `messages`. Broadcasting needs
-- INSERT, not SELECT, so the read branch goes and the write branch stays,
-- narrowed to what a broadcast actually is.

drop policy if exists messages_select_staff on public.messages;
create policy messages_select_staff on public.messages
  for select using (
    (entity_type = 'student' and staff_can_view_student(entity_id))
    or (entity_type = 'university' and is_active_staff())
  );

-- Marketing keeps the ability to broadcast to students they would not
-- otherwise be able to open, because that is the feature — but only as an
-- ordinary outbound portal message. Without the channel clause a marketing
-- user could write an internal note onto any student's record, which is the
-- same reach the read policy had, in the other direction.
drop policy if exists messages_insert_staff on public.messages;
create policy messages_insert_staff on public.messages
  for insert with check (
    (entity_type = 'student' and staff_can_view_student(entity_id))
    or (
      entity_type = 'student'
      and has_role(array['marketing', 'digital_marketing']::staff_role[])
      and channel = 'inapp'
      and direction = 'outbound'
    )
    or (entity_type = 'university' and is_active_staff())
  );

-- Broadcasting had no permission check anywhere: any active staff member could
-- open /marketing/broadcast and send the same message to every student their
-- role can see — for management, processing, finance and super_admin that is
-- all of them. Messaging one student is ordinary work and stays open to
-- whoever handles that student; messaging everybody at once is not.
insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
values (
  'messages.broadcast',
  'Marketing',
  'Broadcast to many students',
  'Send the same in-app portal message to multiple students at once. Messaging an individual student is not affected.',
  '{super_admin,management,marketing,digital_marketing}',
  (select coalesce(max(sort_order), 0) + 10 from public.permission_definitions)
)
on conflict (key) do update
  set category = excluded.category,
      label = excluded.label,
      description = excluded.description;
