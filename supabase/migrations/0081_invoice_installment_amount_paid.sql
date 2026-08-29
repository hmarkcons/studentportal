-- invoice_installments.status already allowed 'partial' (schema, 0010) and
-- the real UI lets staff select it (EditInstallmentForm), but there was no
-- column to record HOW MUCH was actually paid — every consumer that totals
-- money (buildAndStoreInvoicePdf's balanceDue, /reports/revenue-commission's
-- Collected/Outstanding) filtered strictly on status = 'paid', so a partial
-- payment contributed nothing to "collected" while its full amount still
-- counted as outstanding. Add a column to actually record it; 'paid' rows
-- are backfilled to their full amount since that was already true by
-- definition, 'partial'/'unpaid' rows have no historical figure to recover
-- so they default to 0 (safe, not a guess).

alter table invoice_installments add column if not exists amount_paid numeric(12, 2) not null default 0;

update invoice_installments set amount_paid = amount where status = 'paid' and amount_paid = 0;
