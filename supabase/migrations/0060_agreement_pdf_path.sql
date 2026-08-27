-- Generated (unsigned, company-side pre-filled) agreement PDF, produced by
-- the new agreement generator — parallels invoices.pdf_path.
alter table agreements add column if not exists pdf_path text;
