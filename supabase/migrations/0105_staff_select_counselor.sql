-- Same hand-maintained-role-list bug class as 0067 and 0074: staff_select
-- (0006) only ever had management/super_admin/finance/processing added to
-- it — counselor was missed. Result: a counselor-role viewer's "Counselor"
-- column/filter on the Registered Students list (and any other
-- assigned_counselor:staff(...) embed) shows "—" and omits the option
-- entirely for any OTHER counselor's assigned students, since the join to
-- that counselor's staff row is silently blocked by RLS even though the
-- lead row itself is visible.
drop policy if exists "staff_select" on staff;
create policy "staff_select" on staff for select
  using (id = auth.uid() or has_role(array['super_admin', 'management', 'processing', 'finance', 'counselor']::staff_role[]));
