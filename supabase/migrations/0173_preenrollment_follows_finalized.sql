-- Finalising a university in Applications finalises it for the scholarship too.
--
-- The same fact was recorded twice. applications.is_finalized is set by the
-- finalize button — "Pre-Enroll University" in Italy, whose whole purpose is
-- choosing the university the student proceeds with. applications.
-- preenrollment_finalized is a second boolean, ticked by hand on the
-- Scholarship tab, and it is the gate that lets a student see their own
-- scholarship at all (student_scholarships_select, 0012 and 0149).
--
-- So staff pre-enrolled a student in Applications, and the scholarship stayed
-- invisible to that student until somebody remembered a second checkbox on
-- another tab. Nothing on either screen said the two were connected.
--
-- They are now one fact with one source. is_finalized is the source, because
-- it is the one the finalize button writes, the one exactly-one-per-student is
-- enforced on (0091), and the one the rest of the application pipeline reads.

create or replace function public.sync_preenrollment_finalized()
returns trigger
language plpgsql
as $$
begin
  -- Only when the finalisation itself moves. An unrelated update must not
  -- reach over and change the scholarship gate.
  if tg_op = 'INSERT' or new.is_finalized is distinct from old.is_finalized then
    new.preenrollment_finalized := new.is_finalized;
  end if;
  return new;
end;
$$;

comment on function public.sync_preenrollment_finalized is
  'Keeps applications.preenrollment_finalized — the gate on a student seeing their own scholarship — equal to is_finalized, which the finalize/pre-enrol button writes.';

drop trigger if exists trg_sync_preenrollment_finalized on public.applications;
create trigger trg_sync_preenrollment_finalized
  before insert or update on public.applications
  for each row execute function public.sync_preenrollment_finalized();

-- Existing rows, both ways round: a finalised application whose scholarship
-- was never unlocked, and a ticked scholarship box on an application that is
-- not the one being proceeded with.
update public.applications
set preenrollment_finalized = is_finalized
where preenrollment_finalized is distinct from is_finalized;
