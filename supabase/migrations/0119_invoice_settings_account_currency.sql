-- The HMARK bank account has its own currency, which is not always the
-- currency an invoice is denominated in: the public/EU destinations bill in
-- EUR while the account is PKR. Recording it lets the invoice, PDF and email
-- add a conversion note only when the two actually differ, instead of
-- printing an irrelevant line on same-currency invoices or hardcoding "PKR"
-- into the documents.
alter table invoice_settings
  add column if not exists account_currency text;

update invoice_settings set account_currency = 'PKR' where account_currency is null;
