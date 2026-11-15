-- When each education level started and was completed (2026-11-15), on the
-- Academics section of the student's profile — staff's tab and the student's
-- own page alike. Both optional; a completion date may be ahead, for studies
-- still under way. A completion before the start is refused here as well as
-- in the form.

do $$
begin
  if to_regclass('public.student_qualifications') is null then
    raise exception '0367: expects student_qualifications (0086)';
  end if;
end $$;

alter table public.student_qualifications
  add column if not exists start_date date,
  add column if not exists completion_date date;

alter table public.student_qualifications drop constraint if exists student_qualifications_dates_in_order;
alter table public.student_qualifications
  add constraint student_qualifications_dates_in_order
  check (start_date is null or completion_date is null or completion_date >= start_date);

notify pgrst, 'reload schema';
