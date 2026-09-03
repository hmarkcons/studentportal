-- Let a registered student write their own qualification history (new
-- "Academics" section of the merged student Profile tab) — previously only
-- staff could write student_qualifications, even though a student could
-- already read it. Mirrors student_profiles_write's existing
-- staff-or-self pattern (migration 0009).

drop policy if exists "student_qualifications_write" on student_qualifications;
create policy "student_qualifications_write" on student_qualifications for all
  using (staff_can_view_student(student_id) or is_own_student(student_id))
  with check (staff_can_view_student(student_id) or is_own_student(student_id));
