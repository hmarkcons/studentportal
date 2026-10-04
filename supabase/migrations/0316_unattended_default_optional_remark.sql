-- New leads start Unattended; a status change no longer needs a remark; and
-- the leads list reads its filter choices in one request.
--
-- 1. leads.status defaults to 'unattended' (0315), so a lead added by hand or
--    imported with a blank Status starts there. Leads already on file keep the
--    status they have.
--
-- 2. A status change may be made without a remark. update_lead_status (0110)
--    refused one with nothing written, which made a counsellor type something
--    — "called", "." — to move a lead on, and filled the call history with
--    noise. The change is still logged in lead_call_logs, so the history keeps
--    every move; the remark on it is simply null when none was given.
--    Everything else the function did is unchanged: who may call it, and a
--    registered student moved off Registered being unregistered.
--
-- 3. lead_list_options(): what the leads list's filters offer — countries,
--    cities, counsellors — and how many leads there are, from every lead this
--    viewer may see. The page used to read all 2,803 leads, a thousand at a
--    time and one request after another, to work these out, which was most
--    of the time it took to open. Security invoker, so RLS decides what it
--    counts, exactly as the read it replaces.

do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'lead_status' and e.enumlabel = 'unattended'
  ) then
    raise exception 'Apply 0315_lead_status_unattended.sql first: lead_status has no ''unattended''.';
  end if;
end;
$$;

-- 1 -------------------------------------------------------------------------
alter table leads alter column status set default 'unattended';

-- 2 -------------------------------------------------------------------------
alter table lead_call_logs alter column remark drop not null;

create or replace function update_lead_status(p_lead_id uuid, p_status lead_status, p_remark text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old_status lead_status;
  v_remark text := nullif(btrim(coalesce(p_remark, '')), '');
begin
  -- Same condition as the leads_update RLS policy this bypasses (security
  -- definer) — kept in sync manually since the function runs as owner.
  if not exists (
    select 1 from leads l
    where l.id = p_lead_id
      and (l.assigned_counselor_id = auth.uid() or has_role(array['management', 'super_admin']::staff_role[]))
  ) then
    raise exception 'not authorized';
  end if;

  select status into v_old_status from leads where id = p_lead_id;

  insert into lead_call_logs (lead_id, counselor_id, status_at_time, remark)
  values (p_lead_id, auth.uid(), p_status, v_remark);

  if v_old_status = 'registered' and p_status <> 'registered' then
    update leads set status = p_status, registered_at = null where id = p_lead_id;
  else
    update leads set status = p_status where id = p_lead_id;
  end if;
end;
$$;

grant execute on function update_lead_status(uuid, lead_status, text) to authenticated;

-- 3 -------------------------------------------------------------------------
create or replace function lead_list_options() returns jsonb
language sql stable security invoker set search_path = public as $$
  with l as materialized (
    select country_of_interest, nullif(btrim(city), '') as city, assigned_counselor_id
    from leads
  )
  select jsonb_build_object(
    'total', (select count(*) from l),
    'countries', coalesce((
      select jsonb_agg(c) from (select distinct country_of_interest as c from l where coalesce(country_of_interest, '') <> '') x
    ), '[]'::jsonb),
    'cities', coalesce((
      select jsonb_agg(c) from (select distinct city as c from l where city is not null) x
    ), '[]'::jsonb),
    'counselors', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.full_name))
      from staff s
      where s.id in (select assigned_counselor_id from l where assigned_counselor_id is not null)
    ), '[]'::jsonb)
  );
$$;

revoke execute on function lead_list_options() from public, anon;
grant execute on function lead_list_options() to authenticated;
