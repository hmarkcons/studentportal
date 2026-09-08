-- Unread message markers, one per side of the conversation.
--
-- Messaging worked but neither side was told anything had arrived: a student
-- replying to their counsellor produced no signal in the CRM, and a
-- counsellor's message produced none in the portal. Both had to think to look,
-- which for a channel students are told to use is the whole feature missing.
--
-- Two timestamps on the student rather than a per-viewer table: the
-- conversation has exactly two sides. Staff share one marker, which matches
-- how the thread is actually worked — whoever picks it up has dealt with it on
-- the team's behalf.

alter table leads
  add column if not exists messages_read_at_student timestamptz,
  add column if not exists messages_read_at_staff timestamptz;

-- Security definer because neither side may write the other's marker, and a
-- student updating their own leads row otherwise needs a write policy far
-- broader than "I have read my messages".
create or replace function mark_messages_read(p_student_id uuid, p_side text)
returns void
language plpgsql security definer as $$
begin
  if p_side = 'student' then
    if not is_own_student(p_student_id) then
      raise exception 'not authorized';
    end if;
    update leads set messages_read_at_student = now() where id = p_student_id;
  elsif p_side = 'staff' then
    if not (is_active_staff() and staff_can_view_student(p_student_id)) then
      raise exception 'not authorized';
    end if;
    update leads set messages_read_at_staff = now() where id = p_student_id;
  else
    raise exception 'Unknown side.';
  end if;
end; $$;

grant execute on function mark_messages_read(uuid, text) to authenticated;

-- Counting unread means reading the student's marker alongside their messages.
-- Staff can already read leads; a student can read their own row, so both
-- sides can compute their own count without further grants.
create index if not exists messages_entity_sent_at_idx
  on messages (entity_type, entity_id, sent_at desc);
