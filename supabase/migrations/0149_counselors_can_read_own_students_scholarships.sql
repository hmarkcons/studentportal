-- Lets the staff member responsible for a student read that student's
-- scholarships. Read-only.
--
-- student_scholarships_select granted Processing and Super Admin, plus the
-- student themself once pre-enrolment was finalised. A counselor could not see
-- their own student's scholarship at all — so the person the student actually
-- talks to could not tell them whether the award had come through, while the
-- student could see it on their own portal page.
--
-- Keyed on assigned_counselor_id rather than on has_role('counselor'), for two
-- reasons: "their own students" is the point, and leads here are in fact
-- assigned to staff of several roles — management, super_admin and
-- digital_marketing all hold some — so the responsible person is whoever the
-- lead names, whatever their job title. is_active_staff() is required too, so
-- a deactivated staff member's access goes with their account.
--
-- Read-only is already the case and stays so: student_scholarships_write
-- remains has_role(processing, super_admin), and the app layer gates the add,
-- edit and delete controls on scholarships.manage, which a counselor does not
-- have. This policy is SELECT only.
--
-- The counselor branch deliberately does NOT require preenrollment_finalized.
-- That condition exists so a student is not shown a half-finished application;
-- staff need to see the record from the moment it is created, which is the
-- whole point of being asked about it.

drop policy if exists student_scholarships_select on public.student_scholarships;
create policy student_scholarships_select on public.student_scholarships
  for select using (
    has_role(array['processing', 'super_admin']::staff_role[])
    or (
      is_active_staff()
      and exists (
        select 1
        from public.leads l
        where l.id = student_scholarships.student_id
          and l.assigned_counselor_id = auth.uid()
      )
    )
    or (
      is_own_student(student_id)
      and exists (
        select 1
        from public.applications a
        where a.id = student_scholarships.application_id
          and a.preenrollment_finalized
      )
    )
  );
