-- refund_requests had no delete policy at all (insert + update only) — the
-- CRM overhaul lets Super Admin delete a refund record from Finance > Refunds.
create policy "refund_requests_delete" on refund_requests for delete
  using (has_role(array['super_admin']::staff_role[]));
