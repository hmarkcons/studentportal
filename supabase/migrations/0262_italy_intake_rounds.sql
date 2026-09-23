-- Italy's pre-enrolment deadlines: the cycle now open, and the one just closed.
--
-- All 341 Italy (Public) programmes across 28 universities had no intake round
-- at all. That is why no Italy student has ever received a deadline reminder —
-- deadline_reminders chases upcoming deadlines and there were none on file to
-- chase — and why every Italy application fell back to no catalogue deadline.
--
-- One date per cycle rather than one per university, as the office gave it.
-- Italy runs a single September intake (destinations.intake_seasons is
-- '{September/Fall}', intake_mode 'single') and the Universitaly pre-enrolment
-- window is national.
--
-- ------------------------------------------------------------- the ordering
--
-- 2027-06-30 is sort_order 1 and 2026-06-30 is sort_order 2. That is not
-- chronological, and it is the whole point.
--
-- programs.application_deadline is a DERIVED mirror of the first round by
-- sort_order (0232), and that mirror is what the reminder cron, the processing
-- calendar, the staff queue and an application with no deadline of its own all
-- read. Putting the closed cycle first would point every one of them at a date
-- three months in the past — no reminders, and a stale fallback on every new
-- application. The open cycle leads; the closed one is kept behind it as the
-- record of what happened.
--
-- nextRound() agrees: it takes the first round still open in sort order, finds
-- 2027-06-30, and shows that.
--
-- ------------------------------------------------------------ no start_date
--
-- Italian courses begin somewhere between late September and late October
-- depending on the university, and nobody has told us which. A round needs
-- only one of the two dates, so the deadline is recorded and the start is
-- left empty rather than invented — a made-up start date would show a student
-- the wrong month for the thing they are packing for.
--
-- ---------------------------------------------------------------- the labels
--
-- "September/Fall 2027" is exactly what destinations.intake_seasons spells and
-- exactly what the registered students carry in leads.intake, so a round and a
-- student's intake read as the same thing rather than as two vocabularies.

do $$
declare
  italy uuid;
  programmes int;
  inserted int;
begin
  select id into italy from public.destinations where display_name = 'Italy (Public)';
  if italy is null then
    raise exception '0262: no destination called "Italy (Public)" — nothing to attach rounds to';
  end if;

  select count(*) into programmes
  from public.programs p
  join public.universities u on u.id = p.university_id
  where u.destination_id = italy;

  if programmes = 0 then
    raise exception '0262: Italy (Public) has no programmes — the catalogue import has not run';
  end if;

  -- Both rounds are inserted by label, so re-running adds nothing and a
  -- programme that already carries one of them is left alone. The office
  -- editing a date afterwards is not undone by a second run either.
  insert into public.program_intake_rounds (program_id, label, start_date, application_deadline, sort_order)
  select p.id, 'September/Fall 2027', null, date '2027-06-30', 1
  from public.programs p
  join public.universities u on u.id = p.university_id
  where u.destination_id = italy
    and not exists (
      select 1 from public.program_intake_rounds r
      where r.program_id = p.id and r.label = 'September/Fall 2027'
    );
  get diagnostics inserted = row_count;
  raise notice '0262: % open rounds added (September/Fall 2027, apply by 2027-06-30)', inserted;

  insert into public.program_intake_rounds (program_id, label, start_date, application_deadline, sort_order)
  select p.id, 'September/Fall 2026', null, date '2026-06-30', 2
  from public.programs p
  join public.universities u on u.id = p.university_id
  where u.destination_id = italy
    and not exists (
      select 1 from public.program_intake_rounds r
      where r.program_id = p.id and r.label = 'September/Fall 2026'
    );
  get diagnostics inserted = row_count;
  raise notice '0262: % closed rounds added (September/Fall 2026, apply by 2026-06-30)', inserted;
end $$;

-- The mirror is maintained per row by program_intake_rounds_sync, so this only
-- confirms it landed rather than doing the work. A programme whose mirror does
-- not match its first round means the trigger did not fire, which would leave
-- the reminder cron reading a date nothing else agrees with.
do $$
declare
  wrong int;
begin
  select count(*) into wrong
  from public.programs p
  join public.universities u on u.id = p.university_id
  join public.destinations d on d.id = u.destination_id
  where d.display_name = 'Italy (Public)'
    and p.application_deadline is distinct from (
      select r.application_deadline
      from public.program_intake_rounds r
      where r.program_id = p.id
      order by r.sort_order, r.created_at
      limit 1
    );

  if wrong > 0 then
    raise exception '0262: % Italy programmes have a mirror that disagrees with their first round', wrong;
  end if;
end $$;
