-- HMARK CRM rebuild — step 32: second, more serious bug found while testing
-- the new student Profile page (Module 2C).
--
-- `log_audit_event()` (0006) hardcodes `coalesce(new.id, old.id)` as the
-- audited row's identity, assuming every audited table's primary key
-- column is named `id`. Two of the six audited tables don't:
-- `student_profiles` (PK `student_id`) and `program_commission_rates` (PK
-- `program_id`). Every insert/update/delete on either table — by ANY actor,
-- staff included, not just students — has been failing outright with
-- `record "new" has no field "id"` since the moment their audit triggers
-- were created (0008/0009). This means the existing staff-side
-- StudentProfileForm and any program-commission-rate writes have likely
-- never actually worked in a real browser session; nothing before this
-- pass exercised them end-to-end through the UI.
--
-- Fixed by making the trigger function read its target table's real PK
-- column out of the row's own jsonb representation, defaulting to `id` for
-- the four tables where that's already correct, and passing the actual PK
-- column name as a trigger argument for the two that differ.
--
-- Run after 0035_fix_audit_log_actor_fk.sql.

create or replace function log_audit_event() returns trigger
language plpgsql security definer as $$
declare
  pk_column text := coalesce(tg_argv[0], 'id');
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into audit_log (actor_id, action_type, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    (rec ->> pk_column)::uuid,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_program_commission_rates on program_commission_rates;
create trigger trg_audit_program_commission_rates
  after insert or update or delete on program_commission_rates
  for each row execute function log_audit_event('program_id');

drop trigger if exists trg_audit_student_profiles on student_profiles;
create trigger trg_audit_student_profiles
  after insert or update or delete on student_profiles
  for each row execute function log_audit_event('student_id');
