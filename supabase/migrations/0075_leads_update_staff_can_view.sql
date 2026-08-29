-- Same policy-list-mismatch bug class as 0065/0067/0070/0074: leads_update
-- was still the original hand-rolled management/super_admin pair from 0007
-- and was never migrated onto staff_can_view_student() like leads_select
-- (fixed in 0065) and every sibling write policy on tables hung off a
-- student (student_profiles_write, applications_update, visa_records_write,
-- etc. in 0009/0010/0011) already were. Processing/finance staff can already
-- see a registered student via leads_select/staff_can_view_student(), but
-- editing registration details (discount, destinations, counselor
-- reassignment), changing registration status, or reassigning a lead all
-- write to `leads` directly and silently matched zero rows under RLS —
-- no error surfaced to the UI, the row just never updated.
--
-- Fix: make leads_update a proper superset of staff_can_view_student(),
-- same approach 0065 used for leads_select.

drop policy if exists "leads_update" on leads;
create policy "leads_update" on leads for update
  using (
    assigned_counselor_id = auth.uid()
    or has_role(array['management', 'super_admin']::staff_role[])
    or staff_can_view_student(id)
  );
