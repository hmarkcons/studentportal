alter table student_profiles
  add column if not exists passport_issue_date date,
  add column if not exists postal_code text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_number text,
  add column if not exists emergency_contact_relation text,
  add column if not exists qualification_grade text;
