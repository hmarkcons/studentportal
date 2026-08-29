-- sync_visa_outcome_to_application() unconditionally set current_stage =
-- 'visa_granted' whenever a visa record's outcome transitioned to
-- 'approved', with no check on the application's current stage. Every
-- destination's default pipeline_stages ends [..., "visa_granted",
-- "enrolled"] — if staff later touches a visa record on an application
-- that has already reached 'enrolled' (or a manual terminal status like
-- 'rejected'/'withdrawn'), e.g. backfilling/correcting an outcome that was
-- originally left pending, the trigger silently regressed current_stage
-- back to 'visa_granted', corrupting stage-based reporting and anything
-- gated on current_stage = 'enrolled'. Same "advance forward, never
-- backward" carve-out validate_application_stage() already applies to
-- manual statuses (fixed for a related regression in migration 0080).

create or replace function sync_visa_outcome_to_application() returns trigger
language plpgsql security definer as $$
declare
  allowed jsonb;
  stage_list text[];
  app_stage text;
  current_idx int;
  granted_idx int;
begin
  if new.outcome = 'approved' and (old.outcome is distinct from new.outcome) then
    select d.pipeline_stages, a.current_stage into allowed, app_stage
    from applications a
    join universities u on u.id = a.university_id
    join destinations d on d.id = u.destination_id
    where a.id = new.application_id;

    -- Manual terminal statuses sit outside pipeline_stages entirely and
    -- are always allowed regardless of a destination's pipeline — never
    -- overwrite one with a visa outcome sync.
    if app_stage in ('rejected', 'declined', 'withdrawn') then
      return new;
    end if;

    if allowed ? 'visa_granted' then
      select array_agg(value) into stage_list from jsonb_array_elements_text(allowed);
      current_idx := array_position(stage_list, app_stage);
      granted_idx := array_position(stage_list, 'visa_granted');

      -- Only advance forward — never regress an application that has
      -- already reached or passed visa_granted (e.g. already enrolled).
      if current_idx is null or current_idx < granted_idx then
        update applications set current_stage = 'visa_granted' where id = new.application_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;
