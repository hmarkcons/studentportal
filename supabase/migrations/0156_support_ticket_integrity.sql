-- Nobody may sign a support reply as the other side, and a reply moves the
-- ticket it lands on.
--
-- support_ticket_replies_insert (0018) only asked whether the caller could see
-- the ticket. author_type and author_id were whatever the insert claimed — and
-- the app passes author_type as a bound server-action argument, which the
-- client controls. Verified against production with real sessions before this
-- was written; all three were accepted:
--
--   - a student inserting author_type='staff', which their own portal renders
--     as "HMARK Support" and the staff page renders under a named officer;
--   - a student setting author_id to the processing officer's id, so the
--     forgery is attributed to a specific colleague by name;
--   - a staff member inserting author_type='student', putting words into the
--     student's mouth on the support record.
--
-- A support ticket is the escalation path of last resort. A record whose
-- authorship either side can claim is worth less than no record.

drop policy if exists "support_ticket_replies_insert" on support_ticket_replies;
create policy "support_ticket_replies_insert" on support_ticket_replies
  for insert with check (
    -- You sign your own name. Both sides already store the auth user id here,
    -- so this matches what the app writes today.
    author_id = auth.uid()
    and exists (
      select 1 from support_tickets t
       where t.id = support_ticket_replies.ticket_id
         and (
           (
             support_ticket_replies.author_type = 'staff'
             and is_active_staff()
             and staff_can_view_student(t.student_id)
           )
           or (
             support_ticket_replies.author_type = 'student'
             and is_own_student(t.student_id)
           )
         )
    )
  );

-- ------------------------------------------------------- a reply moves it
-- Two things were wrong with how a ticket responded to being replied to.
--
-- First, the reply did not touch the ticket, and the staff queue is ordered by
-- support_tickets.updated_at. A student answering a question left the ticket
-- exactly where it was in the list — under tickets whose status had merely been
-- clicked — while the page showed that stale date as if it were the last thing
-- that happened. (Opening a ticket still must not bump it, which is why the
-- read markers live in their own table; replying is not opening.)
--
-- Second, a student replying to a resolved ticket was invisible. awaitingStaff
-- treats resolved as nobody's problem, so no "Waiting on us" badge appeared,
-- the status stayed "resolved", and the student sat waiting on an answer that
-- nothing had asked anyone for. A reply from the student reopens it.
--
-- Also folds in the open -> in_progress bump the reply action was doing by
-- hand, so "a reply moves the ticket" is one rule in one place that holds
-- however the reply arrives.
create or replace function ticket_reply_moves_ticket() returns trigger
language plpgsql security definer as $$
begin
  update support_tickets
     set status = case
                    when new.author_type = 'student' and status = 'resolved' then 'open'::ticket_status
                    when new.author_type = 'staff' and status = 'open' then 'in_progress'::ticket_status
                    else status
                  end,
         -- set_updated_at fires on this UPDATE, so the queue's ordering and
         -- the date it prints both become "when something last happened".
         updated_at = now()
   where id = new.ticket_id;
  return new;
end; $$;

drop trigger if exists trg_ticket_reply_moves_ticket on support_ticket_replies;
create trigger trg_ticket_reply_moves_ticket
  after insert on support_ticket_replies
  for each row execute function ticket_reply_moves_ticket();

-- ------------------------------------------------------------- what fits
-- No limit existed anywhere. A 200,000-character body was accepted by the
-- database (checked), and it is then stored, read back and rendered in full on
-- every visit to the ticket. The subject had a 200-character rule in the edit
-- action only, so a ticket could be created with a subject no queue could show
-- and then refuse to save when staff tried to shorten it.
--
-- Blank-after-trimming is refused too: the app trims and rejects, but a direct
-- insert of "   " would create a ticket with no question in it.
--
-- No existing rows to migrate — support_tickets and support_ticket_replies are
-- both empty in production.
alter table support_tickets drop constraint if exists support_tickets_subject_length;
alter table support_tickets
  add constraint support_tickets_subject_length
  check (btrim(subject) <> '' and length(subject) <= 200);

alter table support_tickets drop constraint if exists support_tickets_body_length;
alter table support_tickets
  add constraint support_tickets_body_length
  check (btrim(body) <> '' and length(body) <= 5000);

alter table support_ticket_replies drop constraint if exists support_ticket_replies_body_length;
alter table support_ticket_replies
  add constraint support_ticket_replies_body_length
  check (btrim(body) <> '' and length(body) <= 5000);
