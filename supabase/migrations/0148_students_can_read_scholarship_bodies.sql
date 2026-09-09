-- Lets a student read the scholarship directory, so their own scholarship row
-- can say which body awarded it.
--
-- student_scholarships_select already grants a student their own rows once the
-- application's pre-enrolment is finalised — that policy was written for a
-- student-facing scholarship view. But scholarship_bodies_select was
-- is_active_staff(), so the student could read the row and not the body it
-- points at: a scholarship with a uuid and no name.
--
-- Nothing here is sensitive. These are Italy's regional DSU agencies, every
-- one of them published on its own public website (the table carries
-- source_url for exactly that reason). Reads are opened to any authenticated
-- user, matching document_templates and document_sections. Writes stay with
-- Processing and Super Admin, untouched.

drop policy if exists scholarship_bodies_select on public.scholarship_bodies;
create policy scholarship_bodies_select on public.scholarship_bodies
  for select using (auth.role() = 'authenticated');
