-- Make the database agree with the rest of the app about who may touch an
-- invoice.
--
-- Five policies (0056, 0077) granted `processing` write access to invoices,
-- their installments, their line items, the email log and the fee catalog.
-- Everything else on that surface says finance and super_admin only:
--
--   * generate_invoice (0118) raises 'Only Finance/Super Admin can generate
--     invoices.' — the single path that creates one;
--   * issue_receipt_token (0118) raises the same for sending one;
--   * every action in invoices.ts requires finance.invoices.manage, whose
--     default roles are finance and super_admin;
--   * every invoice control in the UI — the panel on the student page, the
--     Invoice Generator, the Consultancy Fee module — is hidden behind that
--     same permission.
--
-- So a processing account could reach no invoice control anywhere, could not
-- create an invoice and could not send one, but could still PATCH invoice and
-- installment rows straight through PostgREST with its own token: change an
-- amount, or mark money received. Dormant write access to the ledger that no
-- feature used.
--
-- The policies are the outlier, so the policies move. This restores what 0010
-- originally had for invoices and installments, and applies the same rule to
-- the three tables 0056/0077 added alongside them.
--
-- Reads are deliberately untouched. A processing officer still sees the
-- invoices of students they handle, through the unchanged *_select policies
-- (staff_can_view_student / is_active_staff) — they just cannot write.
--
-- If the office decides Processing should handle invoices after all, this is
-- two changes, not one: add 'processing' to finance.invoices.manage in
-- permission_definitions.default_roles (or grant it in Admin > Role
-- Permissions), AND widen these policies again. The permission system is
-- app-layer only by design — RLS does not consult it — so granting the
-- permission alone would produce an app that allows the action and a database
-- that silently refuses it, which is exactly the failure 0077 was written to
-- fix in the other direction.

drop policy if exists "invoices_write" on invoices;
create policy "invoices_write" on invoices for all
  using (has_role(array['finance', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'super_admin']::staff_role[]));

drop policy if exists "invoice_installments_write" on invoice_installments;
create policy "invoice_installments_write" on invoice_installments for all
  using (has_role(array['finance', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'super_admin']::staff_role[]));

drop policy if exists "invoice_line_items_write" on invoice_line_items;
create policy "invoice_line_items_write" on invoice_line_items for all
  using (has_role(array['finance', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'super_admin']::staff_role[]));

-- Insert-only, as it was: a log nobody edits. Written by sendInvoiceEmail,
-- which now takes finance.invoices.manage like everything else; the daily
-- overdue cron writes it with a service-role client and is unaffected by RLS.
drop policy if exists "invoice_email_log_write" on invoice_email_log;
create policy "invoice_email_log_write" on invoice_email_log for insert
  with check (has_role(array['finance', 'super_admin']::staff_role[]));

drop policy if exists "fee_products_write" on fee_products;
create policy "fee_products_write" on fee_products for all
  using (has_role(array['finance', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'super_admin']::staff_role[]));
