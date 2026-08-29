-- Regression: 0061 rewrote validate_application_stage()'s body (to add the
-- current_stage-unchanged early return) via `create or replace function`,
-- but its new header dropped `security definer` — silently reintroducing
-- the exact bug 0023 fixed. The function's lookup of destinations.
-- pipeline_stages (via a join through universities) is subject to the
-- CALLER's RLS when not security definer, and partners have no SELECT
-- policy on `destinations` at all — for a partner-initiated stage change,
-- `allowed` resolves NULL, and a NULL condition is falsy in PL/pgSQL, so
-- the trigger silently skips its own validation instead of enforcing it.
-- A partner could set current_stage to any arbitrary string, not just a
-- value in the destination's configured pipeline.

create or replace function validate_application_stage() returns trigger
language plpgsql security definer as $$
declare
  dest_id uuid;
  allowed jsonb;
begin
  if tg_op = 'UPDATE' and new.current_stage is not distinct from old.current_stage then
    return new;
  end if;

  select u.destination_id into dest_id from universities u where u.id = new.university_id;
  select d.pipeline_stages into allowed from destinations d where d.id = dest_id;

  if new.current_stage is null then
    new.current_stage := allowed ->> 0;
  end if;

  -- Rejected/Declined/Withdrawn are always reachable manual statuses,
  -- regardless of a destination's custom pipeline (per the doc).
  if new.current_stage not in ('rejected', 'declined', 'withdrawn') and not (allowed ? new.current_stage) then
    raise exception 'Stage "%" is not part of this destination''s configured pipeline', new.current_stage;
  end if;

  return new;
end;
$$;
