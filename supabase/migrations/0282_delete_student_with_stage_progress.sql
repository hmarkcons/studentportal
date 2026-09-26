-- A Super Admin could not delete a registered student whose countries had
-- stage progress on them: "Only the processing team can remove a country that
-- has stage progress recorded."
--
-- 0276 guards a student's country-stage values so that, once a student is
-- registered, only the processing side can change them — and removing a
-- country with progress on it throws that progress away, so a delete is
-- guarded too. The guard asks staff_can_process_student(), which looks the
-- student up in leads to decide.
--
-- Deleting the student deletes the leads row first; the student's countries
-- go after it, by the foreign key's cascade. By the time the guard runs for
-- each country, the student it looks up is already gone, so the check finds
-- nothing and refuses — for a Super Admin as for anyone — and the whole delete
-- rolls back.
--
-- A country removed because its student is being deleted is not someone
-- discarding progress: it is the student going. Who may do that is the
-- leads_delete policy's decision (Management, Super Admin, Processing —
-- 0070), and it has already been made by the time the cascade runs. So when
-- the student row no longer exists, the guard lets the country go. Removing a
-- country from a student who still exists is guarded exactly as before.

do $$
begin
  if to_regprocedure('public.guard_lead_destination_stages()') is null then
    raise exception '0282: public.guard_lead_destination_stages() is missing (0276)';
  end if;
  if to_regprocedure('public.staff_can_process_student(uuid)') is null then
    raise exception '0282: public.staff_can_process_student(uuid) is missing (0276)';
  end if;
end $$;

create or replace function public.guard_lead_destination_stages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No signed-in user: the server itself, or someone at the database.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  -- A country added with progress already on it: correcting a registration
  -- re-inserts the student's countries with the progress they had.
  if tg_op = 'INSERT'
     and coalesce(new.dashboard_stage_values, '{}'::jsonb) <> '{}'::jsonb
     and not public.staff_can_process_student(new.lead_id) then
    raise exception 'Only the processing team can record a registered student''s country stages.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and new.dashboard_stage_values is distinct from old.dashboard_stage_values
     and not public.staff_can_process_student(new.lead_id) then
    raise exception 'Only the processing team can change a registered student''s country stages.'
      using errcode = '42501';
  end if;

  -- Removing a destination that has progress on it throws that progress away
  -- — unless the student is being deleted, and the country is going with them
  -- (see the header).
  if tg_op = 'DELETE'
     and coalesce(old.dashboard_stage_values, '{}'::jsonb) <> '{}'::jsonb
     and exists (select 1 from public.leads l where l.id = old.lead_id)
     and not public.staff_can_process_student(old.lead_id) then
    raise exception 'Only the processing team can remove a country that has stage progress recorded.'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;
