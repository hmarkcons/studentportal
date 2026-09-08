-- Move the message read markers off leads and onto their own table.
--
-- Putting them on leads had two costs. Every student opening their Messages
-- page wrote an audit_log row, because leads carries a generic audit trigger
-- and a read receipt looked to it like an edit to the lead — thousands of
-- meaningless entries in a trail people rely on. And staff pages read the
-- `students` view rather than leads, whose column list is fixed, so a marker
-- added to the table was not reachable from the view at all.
--
-- A read receipt is not part of the lead record. Its own table has no audit
-- trigger, is readable directly by both sides, and drops out of every existing
-- select.

create table if not exists message_read_markers (
  student_id uuid not null references leads (id) on delete cascade,
  side text not null check (side in ('student', 'staff')),
  read_at timestamptz not null default now(),
  primary key (student_id, side)
);

alter table message_read_markers enable row level security;

-- Each side may read its own marker: the student to badge their menu, staff to
-- badge the Communication tab.
drop policy if exists "read_markers_select" on message_read_markers;
create policy "read_markers_select" on message_read_markers
  for select using (
    (side = 'student' and is_own_student(student_id))
    or (side = 'staff' and is_active_staff() and staff_can_view_student(student_id))
  );

-- No insert/update policy: writes go through mark_messages_read below, so
-- neither side can stamp the other's marker.

-- Carry over anything already recorded, so nobody's badge reappears.
insert into message_read_markers (student_id, side, read_at)
select id, 'student', messages_read_at_student from leads where messages_read_at_student is not null
on conflict (student_id, side) do nothing;

insert into message_read_markers (student_id, side, read_at)
select id, 'staff', messages_read_at_staff from leads where messages_read_at_staff is not null
on conflict (student_id, side) do nothing;

create or replace function mark_messages_read(p_student_id uuid, p_side text)
returns void
language plpgsql security definer as $$
begin
  if p_side = 'student' then
    if not is_own_student(p_student_id) then
      raise exception 'not authorized';
    end if;
  elsif p_side = 'staff' then
    if not (is_active_staff() and staff_can_view_student(p_student_id)) then
      raise exception 'not authorized';
    end if;
  else
    raise exception 'Unknown side.';
  end if;

  insert into message_read_markers (student_id, side, read_at)
  values (p_student_id, p_side, now())
  on conflict (student_id, side) do update set read_at = now();
end; $$;

grant execute on function mark_messages_read(uuid, text) to authenticated;

alter table leads
  drop column if exists messages_read_at_student,
  drop column if exists messages_read_at_staff;
