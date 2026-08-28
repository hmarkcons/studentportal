-- Same nested-RLS bug class documented elsewhere in this project: a nested
-- join into a DIFFERENT RLS-protected table is subject to THAT table's own
-- policy, not the outer query's. invoices_select (and other tables) grant
-- visibility via staff_can_view_student() — which includes processing and
-- finance — but leads_select was a separately hand-maintained role list
-- (management/super_admin/marketing/digital_marketing) that never included
-- them. Result: a processing-role staff member could see an invoice row on
-- /finance/consultancy-fee, but its embedded student:leads(full_name,
-- registered_at) join came back null (RLS-blocked), rendering as "Unknown"
-- with a blank registration date.
--
-- Fix: make leads_select a proper superset of staff_can_view_student()
-- instead of maintaining a second, independently-diverging role list.

drop policy if exists "leads_select" on leads;
create policy "leads_select" on leads for select
  using (
    assigned_counselor_id = auth.uid()
    or has_role(array['management', 'super_admin', 'marketing', 'digital_marketing']::staff_role[])
    or staff_can_view_student(id)
  );
