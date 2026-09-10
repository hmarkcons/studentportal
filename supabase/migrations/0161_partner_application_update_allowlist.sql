-- A partner university could finalise an application for the visa, move its
-- deadline, and set its application fee.
--
-- restrict_partner_application_updates (0016) is a denylist: it names the
-- columns a partner may not change. It was written when applications had
-- student_id, university_id, program_id, intake, current_stage and
-- preenrollment_finalized, and it names four of them. Every column added
-- afterwards became writable by a partner the moment it existed:
--
--   * deadline, application_fee, special_requirements (0040)
--   * is_finalized (0058)
--
-- Verified against production with a partner account's own session before
-- writing this: finalising for the visa, changing the deadline and setting the
-- application fee were all accepted. The partner portal offers none of them —
-- its only control is the stage dropdown — so this was reach nobody intended.
--
-- It matters most for is_finalized. Finalising is HMARK deciding which
-- university a student is actually pursuing a visa for; the country trackers
-- key their visa fields off it, and only one application may hold it. A
-- university could set it on their own application, and the deadline is now
-- what drives the processing officer's reminders and calendar entries (0157),
-- so moving it moves HMARK's internal deadline too.
--
-- This is the third time a hand-maintained list in this schema has gone stale
-- the same way (staff_select in 0074 and again in 0105). So it is inverted:
-- current_stage is the one thing a partner may change, and anything added to
-- this table in future is refused by default rather than quietly becoming
-- theirs to write.

create or replace function restrict_partner_application_updates() returns trigger
language plpgsql as $$
declare
  v_partner_uni uuid;
begin
  v_partner_uni := partner_university_id();

  -- Not a partner, or not their application: staff rules apply instead.
  if v_partner_uni is null or v_partner_uni is distinct from old.university_id then
    return new;
  end if;

  -- An allowlist of one, compared structurally rather than by naming the
  -- columns. Listing what may not change is what went stale twice; comparing
  -- the whole row with the two permitted keys removed cannot, because a column
  -- added tomorrow is part of the comparison the moment it exists.
  --
  -- updated_at is excluded because set_updated_at has already stamped it by
  -- the time this runs (both are BEFORE UPDATE, and trg_applications_updated_at
  -- sorts first).
  if (to_jsonb(new) - 'current_stage' - 'updated_at')
     <> (to_jsonb(old) - 'current_stage' - 'updated_at') then
    raise exception 'A partner university account may only change an application''s stage.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_restrict_partner_application_updates on applications;
create trigger trg_restrict_partner_application_updates
  before update on applications
  for each row execute function restrict_partner_application_updates();
