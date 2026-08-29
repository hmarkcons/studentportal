-- Same nested-RLS/hand-maintained-role-list bug class as 0065 and 0067:
-- staff_can_view_student() and leads_select treat
-- management/super_admin/processing/finance as the equivalent set of
-- broad-visibility "back office" roles, but staff_select (0067) only ever
-- had management/super_admin/finance added to it — processing was missed.
-- Result: a processing-role staff member sees the Dashboard's "counselors"
-- query return nothing (staff_select hides every other staff row from
-- them), rendering a blank "0 registered / No active counselors yet."
-- dashboard even when real registrations exist that same month.

drop policy if exists "staff_select" on staff;
create policy "staff_select" on staff for select
  using (id = auth.uid() or has_role(array['super_admin', 'management', 'processing', 'finance']::staff_role[]));
