-- updateLeadStatus() (src/lib/actions/leads.ts) did two separate client-side
-- writes: insert into lead_call_logs, then update leads.status. If the
-- second write failed (network blip, a future stricter leads_update policy,
-- etc.) the call log would already say a status change happened that never
-- actually took effect on the lead — the two rows could silently disagree
-- forever. Move both writes into one security-definer function so they
-- commit or fail together as a single transaction.
create or replace function update_lead_status(p_lead_id uuid, p_status lead_status, p_remark text) returns void
language plpgsql security definer as $$
begin
  if p_remark is null or btrim(p_remark) = '' then
    raise exception 'A remark is required for every status update (call log).';
  end if;

  -- Same condition as the leads_update RLS policy this bypasses (security
  -- definer) — kept in sync manually since the function runs as owner.
  if not exists (
    select 1 from leads l
    where l.id = p_lead_id
      and (l.assigned_counselor_id = auth.uid() or has_role(array['management', 'super_admin']::staff_role[]))
  ) then
    raise exception 'not authorized';
  end if;

  insert into lead_call_logs (lead_id, counselor_id, status_at_time, remark)
  values (p_lead_id, auth.uid(), p_status, p_remark);

  update leads set status = p_status where id = p_lead_id;
end;
$$;

grant execute on function update_lead_status(uuid, lead_status, text) to authenticated;
