-- Every invoice email, logged: when, to which address, what it was and who
-- sent it — shown under "Sent log" on the invoice.
--
-- invoice_email_log (0056) was written by only two of the four ways an
-- invoice is emailed: the old consultancy-fee button and the overdue
-- reminder. "Email invoice" on the student's page, "Send to student" in the
-- Invoice Generator and "Send receipt" wrote nothing, so the log held almost
-- none of what was sent. The one function every invoice email goes through
-- now writes it (buildAndSendInvoiceEmail), and a receipt is a kind of its own.

alter table public.invoice_email_log drop constraint if exists invoice_email_log_kind_check;
alter table public.invoice_email_log
  add constraint invoice_email_log_kind_check check (kind in ('invoice', 'overdue_reminder', 'receipt'));

create index if not exists invoice_email_log_invoice_idx on public.invoice_email_log (invoice_id, created_at desc);
