-- Stop the re-engagement message editor being undeletable.
--
-- reengagement_messages.updated_by records who last edited the ghost and
-- withdrawn re-engagement emails. Its foreign key was declared without an
-- ON DELETE clause:
--
--   FOREIGN KEY (updated_by) REFERENCES auth.users(id)
--
-- which means NO ACTION — so once a staff member had edited those messages,
-- their auth account could not be deleted at all. Supabase returns nothing
-- more useful than "Database error deleting user", so the cause is not
-- obvious from the failure; it was found by walking every foreign key into
-- auth.users looking for the one holding the id.
--
-- The table is a singleton (id boolean, primary key, CHECK (id)), so there is
-- exactly one row and exactly one editor recorded at a time. One person
-- editing the re-engagement wording was enough to make their account
-- permanently undeletable, which would have surfaced the first time somebody
-- left the company.
--
-- Every other "who did this" column pointing at auth.users is already
-- ON DELETE SET NULL — application_stage_history.changed_by,
-- audit_log.actor_id, leads.auth_user_id — and updated_by is already nullable,
-- so SET NULL is plainly what was meant. Losing the attribution when the
-- account goes is the right trade: the wording stays, the name behind it does
-- not.
alter table public.reengagement_messages
  drop constraint reengagement_messages_updated_by_fkey;

alter table public.reengagement_messages
  add constraint reengagement_messages_updated_by_fkey
  foreign key (updated_by) references auth.users (id) on delete set null;
