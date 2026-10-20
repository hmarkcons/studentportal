-- Each trip and each visa refusal on a student's profile asks for its own
-- document, by name (0336).
--
-- The Travel & visa history on a profile (student_profiles.travel_history and
-- visa_refusal_history) used to raise one requirement for all the travel,
-- "Previous travel history — visas & stamps", and one for all the refusals,
-- "Previous refusal / deportation papers", keyed profile:travel_history and
-- profile:visa_refusals. The app now asks for each trip's visa and stamps —
-- "Previous visa — UAE, 4–20 Aug 2026", keyed previous_visa:<the trip's id> —
-- and each refusal's letter — "Visa refusal letter — UK, 12 Mar 2024", keyed
-- visa_refusal:<the refusal's id> (documentChecklist.ts). The old travel rows
-- were all empty when this was written, and the app takes an empty one away
-- itself. This migration does the database's part:
--
--   1. The one key per student becomes one key per student per intake, as the
--      templates' did in 0182. A derived requirement in the visa section was
--      raised once and never again: a new intake does not inherit the visa
--      papers, and the old row still held the key, so the student who re-applies
--      after a refusal, the one who most needs it, was never asked for the letter.
--
--   2. A refusal requirement already raised under the old key is moved to the
--      first refusal on the profile, keeping its file and its review, rather
--      than being left beside a new empty one asking for the same letter. (One
--      row, approved with a file, when this was written.) A travel one with a
--      file would be kept by the app as it is, beside the new ones.
--
--   3. The previous visa's and the refusal letter's guides get a note saying
--      what to upload, where they have none yet. They stay editable in
--      Setup > Create Doc Checklist.
--
--   4. The student's counsellor and processing officer are alerted when a
--      refusal or deportation is added to the profile, whoever added it, except
--      the one who did.

-- --------------------------------------------------------- precondition
-- A requirement deleted under an old key meant "do not ask this student for
-- these". The new keys would not see that and would ask again, so what it
-- should mean now is for whoever applies this to decide.
do $$
begin
  if exists (select 1 from public.student_document_removals where derived_key in ('profile:visa_refusals', 'profile:travel_history')) then
    raise exception '0336: a travel history or refusal requirement was deleted for some student; decide what that means for their previous visas and refusal letters before applying';
  end if;
end;
$$;

-- -------------------------------------------- 1. one key per intake
drop index if exists public.student_documents_derived_key_unique;

-- Nulls not distinct, so a row whose intake is not yet known still holds its
-- key alone, as it did under the index this replaces.
create unique index if not exists student_documents_derived_key_per_cycle
  on public.student_documents (student_id, cycle_id, derived_key) nulls not distinct
  where derived_key is not null;

-- ---------------------------------- 2. the old row, to the first refusal
do $$
declare
  d record;
  v_key text;
begin
  for d in
    select sd.id, sd.student_id, p.visa_refusal_history -> 0 ->> 'id' as first_id
    from public.student_documents sd
    join public.student_profiles p on p.student_id = sd.student_id
    where sd.derived_key = 'profile:visa_refusals'
      and jsonb_typeof(p.visa_refusal_history) = 'array'
      and nullif(btrim(p.visa_refusal_history -> 0 ->> 'id'), '') is not null
  loop
    v_key := 'visa_refusal:' || d.first_id;
    -- One the app already raised for that refusal, still empty, gives way to
    -- the row with the letter in it.
    delete from public.student_documents x
    where x.student_id = d.student_id
      and x.derived_key = v_key
      and x.file_path is null
      and not exists (select 1 from public.student_document_files f where f.document_id = x.id);
    if exists (select 1 from public.student_documents x where x.student_id = d.student_id and x.derived_key = v_key) then
      raise exception '0336: student % already has a letter of its own under %; merge the two by hand', d.student_id, v_key;
    end if;
    -- The name follows from the profile the next time the checklist is
    -- brought up to date (reconcileDerived renames it).
    update public.student_documents set derived_key = v_key where id = d.id;
  end loop;
end;
$$;

-- ------------------------------------------------- 3. what to upload
update public.profile_document_guides
set description = 'The visa for this trip — the visa page in your passport, or the e-visa — and the entry and exit stamps: every passport page that shows them. If the visa was in an old passport, upload the pages from that passport.'
where kind = 'profile:travel_history'
  and nullif(btrim(coalesce(description, '')), '') is null;

update public.profile_document_guides
set description = 'The letter the embassy or consulate gave you when the visa was refused: every page, in colour. For a deportation, the deportation order or papers. If you no longer have it, upload what you do have (the email, or the passport page with the refusal stamp) and tell your counsellor.'
where kind = 'profile:visa_refusals'
  and nullif(btrim(coalesce(description, '')), '') is null;

-- ------------------------------------------------------------ 4. the alert
-- Everything it writes is coalesced: an alert that fails fails the save it
-- rides on (0320), and a refusal with no date or reason is still a refusal.
create or replace function public.notifications_on_visa_refusal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_name text;
  v_deported boolean;
  v_country text;
  v_date text;
  v_reason text;
  v_title text;
  v_body text;
  r record;
begin
  if jsonb_typeof(new.visa_refusal_history) is distinct from 'array' then
    return null;
  end if;
  if tg_op = 'UPDATE' and jsonb_typeof(old.visa_refusal_history) = 'array' then
    v_old := old.visa_refusal_history;
  end if;

  for v_entry in select value from jsonb_array_elements(new.visa_refusal_history) loop
    -- One on file before this save is not news, and nor is one corrected:
    -- the form keeps each refusal's id across saves.
    continue when jsonb_typeof(v_entry) is distinct from 'object';
    continue when exists (
      select 1 from jsonb_array_elements(v_old) o
      where coalesce(o ->> 'id', o::text) = coalesce(v_entry ->> 'id', v_entry::text)
    );

    if v_name is null then
      select nullif(btrim(full_name), '') into v_name from leads where id = new.student_id;
      v_name := coalesce(v_name, 'A student');
    end if;
    v_deported := coalesce(v_entry ->> 'type', '') = 'deportation';
    v_country := coalesce(nullif(btrim(v_entry ->> 'country'), ''), 'a country not named');
    v_reason := nullif(btrim(coalesce(v_entry ->> 'reason', '')), '');
    v_date := null;
    begin
      if coalesce(v_entry ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$' then
        v_date := to_char((v_entry ->> 'date')::date, 'FMDD Mon YYYY');
      end if;
    exception when others then
      v_date := null;
    end;

    v_title := v_name || ' added ' || case when v_deported then 'a deportation from ' else 'a visa refusal by ' end || v_country;
    v_body := case when v_deported then 'Deported from ' else 'Refused by ' end || v_country
      || coalesce(' on ' || v_date, '') || coalesce(': ' || v_reason, '') || '. '
      || case when v_deported then 'The deportation papers are' else 'The refusal letter is' end
      || ' now asked for in the visa section of their documents.';

    for r in select staff_id from notify_student_staff(new.student_id) loop
      perform notify(r.staff_id, 'visa_refusal', 'visa_refusal:' || new.student_id,
        v_title, v_name || ' added {n} visa refusals or deportations', v_body,
        '/students/' || new.student_id || '/documents', null, new.student_id, true, true);
    end loop;
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_notifications_on_visa_refusal on public.student_profiles;
create trigger trg_notifications_on_visa_refusal
  after insert or update of visa_refusal_history on public.student_profiles
  for each row execute function public.notifications_on_visa_refusal();
