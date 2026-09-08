-- Tell a student when support has replied.
--
-- Tickets are the escalation path — the portal tells a stuck student to open
-- one — but nothing signalled a reply. The student had to remember to go back
-- and look, which for the channel of last resort is the worst place to make
-- someone guess.
--
-- Staff need no marker: a support queue's question is "who is waiting on me",
-- which is derivable from the thread itself (last activity came from the
-- student, or the ticket has no replies yet). Only the student side needs
-- "has anything arrived since I last looked".
--
-- Its own table rather than a column on support_tickets: that table carries
-- set_updated_at, and the staff queue is ordered by updated_at, so a student
-- opening a ticket would shove it to the top of staff's list.

create table if not exists support_ticket_read_markers (
  ticket_id uuid not null references support_tickets (id) on delete cascade,
  side text not null check (side in ('student', 'staff')),
  read_at timestamptz not null default now(),
  primary key (ticket_id, side)
);

alter table support_ticket_read_markers enable row level security;

drop policy if exists "ticket_read_markers_select" on support_ticket_read_markers;
create policy "ticket_read_markers_select" on support_ticket_read_markers
  for select using (
    exists (
      select 1 from support_tickets t
       where t.id = support_ticket_read_markers.ticket_id
         and (
           (support_ticket_read_markers.side = 'student' and is_own_student(t.student_id))
           or (support_ticket_read_markers.side = 'staff' and is_active_staff() and staff_can_view_student(t.student_id))
         )
    )
  );

-- No insert/update policy: the RPC below is the only writer, so neither side
-- can stamp the other's marker.
create or replace function mark_ticket_read(p_ticket_id uuid, p_side text)
returns void
language plpgsql security definer as $$
declare
  v_student uuid;
begin
  select student_id into v_student from support_tickets where id = p_ticket_id;
  if v_student is null then
    raise exception 'Ticket not found.';
  end if;

  if p_side = 'student' then
    if not is_own_student(v_student) then
      raise exception 'not authorized';
    end if;
  elsif p_side = 'staff' then
    if not (is_active_staff() and staff_can_view_student(v_student)) then
      raise exception 'not authorized';
    end if;
  else
    raise exception 'Unknown side.';
  end if;

  insert into support_ticket_read_markers (ticket_id, side, read_at)
  values (p_ticket_id, p_side, now())
  on conflict (ticket_id, side) do update set read_at = now();
end; $$;

grant execute on function mark_ticket_read(uuid, text) to authenticated;

create index if not exists support_ticket_replies_ticket_created_idx
  on support_ticket_replies (ticket_id, created_at desc);
