alter table applications add column if not exists is_finalized boolean not null default false;

-- Only one application per student can be finalized (for visa) at a time.
create unique index if not exists applications_one_finalized_per_student
  on applications (student_id)
  where is_finalized;
