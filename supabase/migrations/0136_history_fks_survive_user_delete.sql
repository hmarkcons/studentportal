-- Let a staff auth user be deleted once their staff row is gone.
--
-- audit_log.actor_id and application_stage_history.changed_by both referenced
-- auth.users with NO ACTION, so any staff member who had ever touched a lead
-- (the audit trigger on leads fires on every edit) could not be removed from
-- auth. deleteStaffAccount deleted the staff row, swallowed the resulting
-- "Database error deleting user" with .catch(() => {}), and reported success —
-- leaving a login that still authenticated. It could not reach any data (no
-- staff row means is_active_staff() is false, and every staff route bounces to
-- /), but the account was not actually deleted.
--
-- SET NULL rather than CASCADE on purpose: these are history tables. Losing the
-- actor's name on an old audit row is acceptable; losing the row itself is not,
-- and cascade would quietly delete audit history as a side effect of removing
-- an employee. Both columns are already nullable.

alter table public.audit_log
  drop constraint if exists audit_log_actor_id_fkey;
alter table public.audit_log
  add constraint audit_log_actor_id_fkey
  foreign key (actor_id) references auth.users (id) on delete set null;

alter table public.application_stage_history
  drop constraint if exists application_stage_history_changed_by_fkey;
alter table public.application_stage_history
  add constraint application_stage_history_changed_by_fkey
  foreign key (changed_by) references auth.users (id) on delete set null;
