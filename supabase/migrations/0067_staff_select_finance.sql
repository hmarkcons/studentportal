-- Same nested-RLS bug class as migration 0065: staff_select (0006) only
-- allowed a staff member to read their own row, or management/super_admin to
-- read all. Every payroll/commission app-level check (requireFinance in
-- src/lib/actions/finance.ts) explicitly treats `finance` as an intended
-- manager of this feature, but the Payroll page's `staff` queries (the
-- dropdown list, and the per-staff detail lookup keyed by ?staff=<id>) rely
-- on staff_select -- so a finance-role user got an empty staff dropdown and
-- a blank panel even navigating straight to their own /finance/payroll?staff=
-- URL. Confirmed via a real finance-role session before this fix.
drop policy if exists "staff_select" on staff;
create policy "staff_select" on staff for select
  using (id = auth.uid() or has_role(array['super_admin', 'management', 'finance']::staff_role[]));
