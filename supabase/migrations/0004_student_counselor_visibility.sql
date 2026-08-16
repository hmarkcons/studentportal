-- Lets a student see the name of their own assigned counselor (e.g. "who do
-- I contact"), without granting any broader visibility into staff.

create policy "staff_select_for_own_student" on staff for select
  using (exists (
    select 1 from students st
    where st.assigned_counselor_id = staff.id and st.auth_user_id = auth.uid()
  ));
