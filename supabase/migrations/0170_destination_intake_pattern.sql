-- Intake stops being a free text box everywhere and follows the country.
--
-- The column held two values across the whole system: "Fall 27" and
-- "Fall 2027". The same intake, typed twice, which no filter, report or
-- deadline can group — the Consultancy Fee overview offers both as separate
-- choices in its Intake filter, and neither finds the other's students.
--
-- But one control cannot be right everywhere. Italy, France and Finland run a
-- single intake a year, so there is nothing to choose but the year. Austria,
-- Germany and Turkey run two, and a student is sometimes offered both. The UK
-- runs several and the office wants to keep writing them out. So the shape is
-- configured per destination, the way pipeline stages and the finalize term
-- already are, and a destination added next year needs no code.

-- destinations.intake_seasons has existed since 0008 and was seeded in 0028.
-- Nothing has ever read it — no view, no query, no page — so rather than add a
-- second column meaning almost the same thing, this is what it now means.
alter table public.destinations
  add column if not exists intake_mode text not null default 'free_text';

alter table public.destinations drop constraint if exists destinations_intake_mode_check;
alter table public.destinations
  add constraint destinations_intake_mode_check
  check (intake_mode in ('single', 'multi', 'free_text'));

comment on column public.destinations.intake_mode is
  'single = one fixed intake a year, staff choose only the year; multi = tick one or more of intake_seasons; free_text = type it out.';
comment on column public.destinations.intake_seasons is
  'The intake labels offered, in the order they are shown and written into leads.intake / applications.intake. Empty for free_text.';

-- ------------------------------------------------------------- the seven
-- Matched on country rather than id so this is re-runnable and survives a
-- destination being recreated. Anything not named here keeps free text, which
-- is exactly what every destination does today — no form changes shape until
-- the office says what that country's intakes are.
update public.destinations
set intake_mode = 'single', intake_seasons = array['September/Fall']
where lower(btrim(country)) in ('italy', 'france', 'finland');

-- Germany's row carried "Winter (October start, 15 July deadline)" and
-- "Summer (April start, 15 January deadline)" — reference notes typed in 0028
-- that nothing ever displayed. Replaced with the labels the office uses, since
-- these strings are now written onto invoices and applications; the deadlines
-- they mentioned live on the applications themselves.
update public.destinations
set intake_mode = 'multi', intake_seasons = array['Spring/Summer', 'Fall/Winter']
where lower(btrim(country)) in ('austria', 'germany', 'turkey');

update public.destinations
set intake_mode = 'free_text'
where lower(btrim(country)) in ('united kingdom', 'uk');

-- A picker with nothing to pick is a dead end for whoever opens the form, and
-- the only way out of it is a developer. Added last, so the rows above satisfy
-- it rather than the other way round.
alter table public.destinations drop constraint if exists destinations_intake_seasons_check;
alter table public.destinations
  add constraint destinations_intake_seasons_check
  check (intake_mode = 'free_text' or coalesce(array_length(intake_seasons, 1), 0) >= 1);
