-- Anything in any field of the catalogue and the scholarship directory.
--
-- The office asked to be able to write whatever a university actually says,
-- in every field: several coordinator emails, several fees, a level that is
-- not one of the three ("Foundation", "Single-cycle master's"), "Rolling" for
-- a deadline, "Only for non-EU students" for whether there is an interview.
-- What stood in the way was in the database as well as the forms:
--
--   programs.level                 one of bachelors / masters / phd.
--                                  Now any text. The three are still how a
--                                  student is matched to a programme
--                                  (suggested_programs, course_interest_options
--                                  compare p.level to leads.level_applying_for),
--                                  so the app writes the usual spellings of
--                                  them — "Master's", "MSc" — as exactly those
--                                  three, and anything else as typed.
--   programs.coordinator_email     one address. Now a list, "a@x.it, b@x.it",
--                                  or anything else; shown as mail links where
--                                  a part is an address.
--   programs.interview_required,   booleans. Now text: "yes", "no", or words.
--   programs.admission_test_required  Existing values become "yes" / "no", as
--                                  the export already wrote them; a new
--                                  programme that says nothing stays null,
--                                  "not known", rather than "no".
--   fees and tuition (0303)        120 characters; now 500, room for several.
--   universities.short_name        32 characters; now 60. The automatic short
--                                  form still aims at 32.
--   program_intake_rounds          a round's start and deadline were dates
--                                  only. Each now has words beside it —
--                                  start_text, deadline_text — shown in place
--                                  of the date. The date, when there is one,
--                                  is still what reminders, the staff queue,
--                                  the calendar and "closed" read, and still
--                                  what programs.start_date / application_deadline
--                                  mirror (0232). A round may now carry only
--                                  words.
--   scholarship_bodies             call_expected_on likewise gets
--                                  call_expected_text.
--
-- Nothing else in the database reads these columns: no view, no policy, and
-- no function but the two level matchers above (checked when this was
-- written). Table-level grants cover the new columns.
--
-- Safe to run again.

do $$
begin
  if to_regclass('public.program_intake_rounds') is null then
    raise exception '0304: program_intake_rounds (0232) is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'programs' and column_name = 'tuition_fee' and data_type = 'text'
  ) then
    raise exception '0304: fees are not text yet — apply 0303 first';
  end if;
end $$;

-- ------------------------------------------------------------------ level
alter table public.programs drop constraint if exists programs_level_check;
alter table public.programs add constraint programs_level_check
  check (char_length(btrim(level)) between 1 and 80);
comment on column public.programs.level is
  'Any text (0304). bachelors / masters / phd — the usual spellings of them are written so — are what a student is matched by (leads.level_applying_for); anything else is shown as typed and matches only itself.';

-- -------------------------------------------------------- coordinator email
alter table public.programs drop constraint if exists programs_coordinator_email_check;
alter table public.programs add constraint programs_coordinator_email_check
  check (coordinator_email is null or char_length(btrim(coordinator_email)) between 1 and 1000);
comment on column public.programs.coordinator_email is
  'Who coordinates the programme: one address, several separated by commas ("a@x.it, b@x.it"), or anything else (0287, 0304).';
comment on column public.universities.contact_email is
  'The admissions contact: one address, several separated by commas, or anything else (0304).';

-- --------------------------------------------------------------- yes / no
do $$
declare
  col text;
begin
  foreach col in array array['interview_required', 'admission_test_required'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'programs' and column_name = col and data_type = 'boolean'
    ) then
      execute format('alter table public.programs alter column %I drop default', col);
      execute format('alter table public.programs alter column %I drop not null', col);
      execute format(
        'alter table public.programs alter column %I type text using (case when %I then ''yes'' else ''no'' end)',
        col, col
      );
    end if;
  end loop;
end $$;
alter table public.programs drop constraint if exists programs_interview_required_check;
alter table public.programs add constraint programs_interview_required_check
  check (interview_required is null or char_length(btrim(interview_required)) between 1 and 500);
alter table public.programs drop constraint if exists programs_admission_test_required_check;
alter table public.programs add constraint programs_admission_test_required_check
  check (admission_test_required is null or char_length(btrim(admission_test_required)) between 1 and 500);
comment on column public.programs.interview_required is
  '"yes", "no", or words ("Only for non-EU students"); null is not known (0304).';
comment on column public.programs.admission_test_required is
  '"yes", "no", or words ("TOLC-I or SAT"); null is not known (0304).';

-- ------------------------------------------------------------ fees, 500
alter table public.universities drop constraint if exists universities_application_fee_check;
alter table public.universities add constraint universities_application_fee_check check (
  (application_fee is null or char_length(btrim(application_fee)) between 1 and 500)
  and (application_fee_currency is null or application_fee_currency ~ '^[A-Z]{3}$')
);
alter table public.programs drop constraint if exists programs_application_fee_check;
alter table public.programs add constraint programs_application_fee_check check (
  (application_fee is null or char_length(btrim(application_fee)) between 1 and 500)
  and (application_fee_currency is null or application_fee_currency ~ '^[A-Z]{3}$')
);
alter table public.programs drop constraint if exists programs_tuition_fee_check;
alter table public.programs add constraint programs_tuition_fee_check check (
  tuition_fee is null or char_length(btrim(tuition_fee)) between 1 and 500
);
alter table public.applications drop constraint if exists applications_application_fee_check;
alter table public.applications add constraint applications_application_fee_check check (
  application_fee is null or char_length(btrim(application_fee)) between 1 and 500
);

-- ------------------------------------------------------------ short name
alter table public.universities drop constraint if exists universities_short_name_check;
alter table public.universities add constraint universities_short_name_check check (
  short_name is null or char_length(btrim(short_name)) between 1 and 60
);

-- ---------------------------------------------------- rounds, in words too
alter table public.program_intake_rounds add column if not exists start_text text;
alter table public.program_intake_rounds add column if not exists deadline_text text;
alter table public.program_intake_rounds drop constraint if exists program_intake_rounds_start_text_check;
alter table public.program_intake_rounds add constraint program_intake_rounds_start_text_check
  check (start_text is null or char_length(btrim(start_text)) between 1 and 200);
alter table public.program_intake_rounds drop constraint if exists program_intake_rounds_deadline_text_check;
alter table public.program_intake_rounds add constraint program_intake_rounds_deadline_text_check
  check (deadline_text is null or char_length(btrim(deadline_text)) between 1 and 200);
alter table public.program_intake_rounds drop constraint if exists program_intake_rounds_has_a_date;
alter table public.program_intake_rounds add constraint program_intake_rounds_has_a_date check (
  start_date is not null or application_deadline is not null or start_text is not null or deadline_text is not null
);
comment on column public.program_intake_rounds.start_text is
  'The course start as written, shown in place of start_date: "Late September", or "15 Sept 2027 (orientation week)" beside the date read out of it. Null when the date says it all (0304).';
comment on column public.program_intake_rounds.deadline_text is
  'The deadline as written, shown in place of application_deadline: "Rolling", "TBA March 2027". Reminders and "closed" read only application_deadline, so words alone remind nobody (0304).';

-- ------------------------------------------- the call's expected date, too
alter table public.scholarship_bodies add column if not exists call_expected_text text;
alter table public.scholarship_bodies drop constraint if exists scholarship_bodies_call_expected_text_check;
alter table public.scholarship_bodies add constraint scholarship_bodies_call_expected_text_check
  check (call_expected_text is null or char_length(btrim(call_expected_text)) between 1 and 200);
comment on column public.scholarship_bodies.call_expected_text is
  'When this year''s call is expected, as written ("Early July"), shown in place of call_expected_on (0304).';

-- ------------------------------------------------------------- the proof
do $$
declare
  n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'programs'
    and column_name in ('interview_required', 'admission_test_required') and data_type <> 'text';
  if n > 0 then raise exception '0304: % yes/no columns are not text', n; end if;

  select count(*) into n from information_schema.columns
  where table_schema = 'public'
    and ((table_name = 'program_intake_rounds' and column_name in ('start_text', 'deadline_text'))
      or (table_name = 'scholarship_bodies' and column_name = 'call_expected_text'));
  if n <> 3 then raise exception '0304: expected 3 new text columns, found %', n; end if;
end $$;

notify pgrst, 'reload schema';
