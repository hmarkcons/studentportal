-- Moving a registered student's lead pipeline status away from 'registered'
-- now "unregisters" them: registered_at is cleared, which drops them out of
-- the `students` view (registered_at is not null) and back into the Leads
-- pipeline with the new status, while every other row/table (profile,
-- documents, agreements, invoices, applications — none of it references
-- registered_at) stays completely untouched.
--
-- Moving status back to 'registered' later needs no special handling here:
-- handle_lead_registration() (0009) already re-stamps registered_at whenever
-- status transitions into 'registered' while registered_at is null, so the
-- student reappears with everything intact the moment a counselor picks
-- "Registered" again from this same status control.
create or replace function update_lead_status(p_lead_id uuid, p_status lead_status, p_remark text) returns void
language plpgsql security definer as $$
declare
  v_old_status lead_status;
begin
  if p_remark is null or btrim(p_remark) = '' then
    raise exception 'A remark is required for every status update (call log).';
  end if;

  if not exists (
    select 1 from leads l
    where l.id = p_lead_id
      and (l.assigned_counselor_id = auth.uid() or has_role(array['management', 'super_admin']::staff_role[]))
  ) then
    raise exception 'not authorized';
  end if;

  select status into v_old_status from leads where id = p_lead_id;

  insert into lead_call_logs (lead_id, counselor_id, status_at_time, remark)
  values (p_lead_id, auth.uid(), p_status, p_remark);

  if v_old_status = 'registered' and p_status <> 'registered' then
    update leads set status = p_status, registered_at = null where id = p_lead_id;
  else
    update leads set status = p_status where id = p_lead_id;
  end if;
end;
$$;
