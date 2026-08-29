-- Same policy-list-mismatch bug class as 0077's fee_products_write fix:
-- invoices_write and invoice_installments_write were both widened to
-- include processing in 0056 (to match /finance/consultancy-fee's
-- requireProcessingOrAbove gate), but the sibling receipts_write policy —
-- written in the same original 0010 block, touched by the same
-- sendReceipt() code path — was never updated. sendReceipt() writes to
-- both `invoices` (succeeds for processing since 0056) and `receipts`
-- (silently blocked for processing), with no error surfaced anywhere:
-- a processing-role staff member clicking "Send receipt" flips the
-- invoice to sent but never creates/updates the receipts row.

drop policy if exists "receipts_write" on receipts;
create policy "receipts_write" on receipts for all
  using (has_role(array['finance', 'super_admin', 'processing']::staff_role[]))
  with check (has_role(array['finance', 'super_admin', 'processing']::staff_role[]));
