-- Installment plan tracking: destinations carry the standard/default plan
-- for that country's fee (e.g. "2 installments"), invoices record the plan
-- actually used for that student's invoice. Both are free text — the
-- existing invoice_installments table already tracks the granular
-- amount/due-date/status breakdown; this is a human-readable label
-- alongside it, not a replacement.

alter table destinations add column if not exists installment_plan text;
alter table invoices add column if not exists installment_plan text;
