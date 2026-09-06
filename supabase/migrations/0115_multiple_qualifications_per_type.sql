-- A student can hold two qualifications of the same kind (two Bachelors from
-- different institutions, say), which the one-row-per-type unique constraint
-- made impossible.
--
-- Schools stay singular: Secondary/High School are fixed rows driving the
-- completeness checklist, so a partial unique index keeps exactly one of each
-- per student while letting every degree type repeat freely.
alter table student_qualifications
  drop constraint if exists student_qualifications_student_id_qualification_type_key;

create unique index if not exists student_qualifications_one_school_per_student
  on student_qualifications (student_id, qualification_type)
  where qualification_type in ('secondary_school', 'high_school');
