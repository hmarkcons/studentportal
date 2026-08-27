alter table invoices
  add column if not exists invoice_number text,
  add column if not exists intake text,
  add column if not exists terms text,
  add column if not exists pdf_path text;

alter table invoice_installments
  add column if not exists payment_method text;
