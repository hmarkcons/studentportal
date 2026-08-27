-- Bug fix: validate_application_stage() (0011) re-validates current_stage on
-- EVERY update to an applications row, not just when current_stage itself
-- changes. finalizeApplication() bulk-clears is_finalized across all of a
-- student's applications in one UPDATE — if any other application of theirs
-- has a current_stage that no longer exists in its destination's
-- (editable) pipeline_stages, that unrelated bulk update now fails outright,
-- blocking finalize/un-finalize for every application of that student.
-- Skip re-validation on UPDATE when current_stage isn't actually changing;
-- INSERT and stage-changing UPDATEs are still fully validated.

create or replace function validate_application_stage() returns trigger
language plpgsql as $$
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
