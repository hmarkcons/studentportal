-- Staff choose how many installments (1-3) the consultancy fee is split
-- into on the agreement's payment chart, mirroring the existing invoice
-- installment_count dropdown (see generateInvoice in src/lib/actions/invoices.ts).
alter table agreements
  add column installment_count smallint not null default 1
  check (installment_count between 1 and 3);
