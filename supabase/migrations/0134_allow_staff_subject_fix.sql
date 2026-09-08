-- Let staff correct a garbled ticket subject.
--
-- 0133 froze the subject along with the body, on the grounds that both are the
-- student's own account of their problem. The subject is different in practice:
-- it is the line staff scan a queue by, and a student typing "URGENT!!!" or
-- mistyping their question leaves everyone worse off. The body — the actual
-- description — stays frozen, as does the ticket's owner.
--
-- UPDATE is already staff-only (0133), so anything reaching this trigger is a
-- staff edit.

create or replace function protect_ticket_statement()
returns trigger
language plpgsql as $$
begin
  if new.student_id is distinct from old.student_id then
    raise exception 'A ticket cannot be moved to a different student.';
  end if;
  -- The body is the student's description of the problem. A support record
  -- whose complaint can be rewritten after the fact is worth less than one
  -- that cannot, so corrections go in a reply, not over the original.
  if new.body is distinct from old.body then
    raise exception 'A ticket body cannot be edited after it is raised — reply on the ticket instead.';
  end if;
  return new;
end; $$;
