-- Narrow support_tickets UPDATE to what the app actually does.
--
-- The policy allowed is_own_student(student_id), so a student could change
-- their own ticket's subject, body or status directly through the API — none
-- of which the portal offers or needs. Creating a ticket and replying to it are
-- separate paths (INSERT here, INSERT on support_ticket_replies) and both are
-- already correctly scoped; nothing on the student side updates a ticket.
--
-- Staff keep UPDATE, which is how status moves through open / in_progress /
-- resolved, including the automatic bump when staff reply.

drop policy if exists "support_tickets_update" on support_tickets;
create policy "support_tickets_update" on support_tickets
  for update
  using (is_active_staff() and staff_can_view_student(student_id))
  with check (is_active_staff() and staff_can_view_student(student_id));

-- RLS grants or denies a whole row, so it cannot say "staff may change the
-- status but not the question". A trigger can, and this is worth stating: the
-- subject and body are the student's own account of their problem, and a
-- support record whose complaint can be edited after the fact is worth less
-- than one that cannot. The same guard blocks moving a ticket to a different
-- student, which would silently hand one person's conversation to another.
create or replace function protect_ticket_statement()
returns trigger
language plpgsql as $$
begin
  if new.student_id is distinct from old.student_id then
    raise exception 'A ticket cannot be moved to a different student.';
  end if;
  if new.subject is distinct from old.subject then
    raise exception 'A ticket subject cannot be edited after it is raised — reply on the ticket instead.';
  end if;
  if new.body is distinct from old.body then
    raise exception 'A ticket body cannot be edited after it is raised — reply on the ticket instead.';
  end if;
  return new;
end; $$;

drop trigger if exists trg_protect_ticket_statement on support_tickets;
create trigger trg_protect_ticket_statement
  before update on support_tickets
  for each row execute function protect_ticket_statement();
