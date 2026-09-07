-- The student Visa tab reads its content straight from the documentation
-- tracker, but both tables are staff-only, so a signed-in student saw an
-- empty page rather than their own visa progress.
--
-- Granting only what that page needs: the definitions of fields explicitly
-- opted in to the student Visa tab, and the saved values for the student's
-- own applications. Nothing else about the tracker becomes visible.

drop policy if exists "tracker_definitions_student_visa_select" on tracker_definitions;
create policy "tracker_definitions_student_visa_select" on tracker_definitions
  for select using (show_on_student_visa = true);

drop policy if exists "application_country_extra_own_student_select" on application_country_extra;
create policy "application_country_extra_own_student_select" on application_country_extra
  for select using (
    exists (
      select 1
        from applications a
       where a.id = application_country_extra.application_id
         and is_own_student(a.student_id)
    )
  );
