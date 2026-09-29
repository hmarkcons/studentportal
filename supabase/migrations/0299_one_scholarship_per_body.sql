-- One record per scholarship body per application.
--
-- The Scholarship tab now offers a finalised university's body ready to work
-- — its status, its documents status and its proof upload — and the first of
-- those changes records the scholarship (src/lib/scholarshipRecord.ts). The
-- app looks for the record before inserting, and one panel queues its own
-- writes, but two browser tabs changing the same student at the same moment
-- could each find nothing and each insert. The student would then see the
-- scholarship twice, with half its proof on each.
--
-- So the database holds the rule: a body appears once per application. A
-- scholarship with no body (a named one the directory does not list) is not
-- constrained — two differently named ones on one application are ordinary.
--
-- Refuses to run if the rule is already broken, rather than choosing which
-- duplicate to keep: which one carries the proof is a judgement for whoever
-- applies this. (Checked before writing: 0 rows in student_scholarships.)

do $$
declare
  v_dupes int;
begin
  select count(*) into v_dupes
  from (
    select application_id, scholarship_body_id
    from public.student_scholarships
    where scholarship_body_id is not null
    group by application_id, scholarship_body_id
    having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise exception '% application(s) already hold the same scholarship body twice — merge them first', v_dupes;
  end if;
end $$;

create unique index if not exists student_scholarships_one_per_body
  on public.student_scholarships (application_id, scholarship_body_id)
  where scholarship_body_id is not null;
