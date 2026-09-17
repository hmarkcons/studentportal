-- When a programme starts, alongside when applications for it close.
--
-- programs.application_deadline has existed all along and is wired into the
-- deadline reminders and the processing officer's calendar (see
-- src/lib/applicationDeadline.ts — the catalogue date is the fallback for an
-- application nobody has dated yet). But staff could only set it by editing a
-- programme after creating it, or through the CSV import, so across 1,957
-- programmes essentially none carried one. The Add programme form never asked.
--
-- There was no start date at all. `intake_dates` looks like it should serve,
-- but it is a free-text array — "September; February" — populated only by the
-- CSV importer and never rendered or edited anywhere. It cannot be a date
-- input, cannot be sorted, and cannot drive a reminder. So it stays as it is,
-- for the list of intakes a programme runs, and this adds a real date for the
-- one a student is actually going out for.
alter table public.programs
  add column if not exists start_date date;

comment on column public.programs.start_date is
  'When the programme itself begins — the intake a student is being prepared for. A real date, so it can be shown, sorted and counted down to. For the free-text list of intakes a programme runs in general, see intake_dates.';

comment on column public.programs.application_deadline is
  'The catalogue closing date for applications to this programme. Used as the fallback deadline for an application nobody has dated individually — applications.deadline wins where it is set.';

comment on column public.programs.intake_dates is
  'Free-text list of the intakes a programme runs, e.g. {September,February}. Set by the CSV import. For the specific date a student''s intake begins, see start_date.';
