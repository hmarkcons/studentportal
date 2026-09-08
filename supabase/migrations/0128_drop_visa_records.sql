-- Retire visa_records, and move the one piece of automation it carried onto
-- the tracker.
--
-- The table is the pre-tracker home for visa progress. Its writer (the staff
-- Visa tab) is deleted, every reader now goes through listVisaDecisions
-- against the tracker, and it holds zero rows. Checked before writing this:
-- nothing references it — no foreign keys point at it, no view or function
-- mentions it, and the only inbound FK is its own to applications.
--
-- But it carried a trigger worth keeping: recording an approved visa advanced
-- the application to the 'visa_granted' pipeline stage. Firing on a table
-- nothing wrote to, that had quietly stopped working. It is reimplemented
-- below against application_country_extra, so it fires when staff record the
-- decision where they actually record it now.

-- ---------------------------------------------------------------------------
-- Approval advances the pipeline stage
-- ---------------------------------------------------------------------------
-- The vocabulary test mirrors readVisaDecision in src/lib/visaOutcome.ts,
-- including the order: refusal words are checked first, because "not approved"
-- contains "approved" and calling a refusal an approval is the worst failure
-- available here.
create or replace function tracker_visa_reads_approved(p_value text)
returns boolean
language sql immutable as $$
  select case
    when coalesce(btrim(p_value), '') = '' then false
    when lower(btrim(p_value)) ~ '(refused|rejected|denied|unsuccessful|declined)' then false
    when lower(btrim(p_value)) ~ '^(not |no )' then false
    when lower(btrim(p_value)) ~ '(approved|granted|issued|accepted|successful|visa received|stamped)' then true
    else false
  end;
$$;

create or replace function sync_tracker_visa_outcome()
returns trigger
language plpgsql security definer as $$
declare
  allowed jsonb;
  stage_list text[];
  app_stage text;
  country text;
  outcome_key text;
  current_idx int;
  granted_idx int;
begin
  -- Only the field a country nominates as its visa outcome, and only when the
  -- value has actually changed to something that reads as an approval.
  if not tracker_visa_reads_approved(new.field_value) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.field_value is not distinct from new.field_value then
    return new;
  end if;

  select d.pipeline_stages, a.current_stage, d.country_code
    into allowed, app_stage, country
    from applications a
    join universities u on u.id = a.university_id
    join destinations d on d.id = u.destination_id
   where a.id = new.application_id;

  select t.field_key into outcome_key
    from tracker_definitions t
   where t.country_code = country and t.visa_role = 'outcome';

  -- A value stored under some other country's field key is not this
  -- application's visa decision.
  if outcome_key is null or outcome_key <> new.field_key then
    return new;
  end if;

  -- Manual terminal statuses sit outside pipeline_stages entirely and are
  -- always allowed regardless of a destination's pipeline — never overwrite
  -- one with a visa outcome sync.
  if app_stage in ('rejected', 'declined', 'withdrawn') then
    return new;
  end if;

  if allowed ? 'visa_granted' then
    select array_agg(value) into stage_list from jsonb_array_elements_text(allowed);
    current_idx := array_position(stage_list, app_stage);
    granted_idx := array_position(stage_list, 'visa_granted');

    -- Only advance forward — never regress an application that has already
    -- reached or passed visa_granted (e.g. already enrolled).
    if current_idx is null or current_idx < granted_idx then
      update applications set current_stage = 'visa_granted' where id = new.application_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_tracker_visa_outcome on application_country_extra;
create trigger trg_sync_tracker_visa_outcome
  after insert or update of field_value on application_country_extra
  for each row execute function sync_tracker_visa_outcome();

-- ---------------------------------------------------------------------------
-- Retire the table
-- ---------------------------------------------------------------------------
-- Its own triggers and policies go with it. The old sync function is dropped
-- separately because nothing else used it; set_updated_at stays, since 35
-- other tables share it.
drop table if exists visa_records;
drop function if exists sync_visa_outcome_to_application();
