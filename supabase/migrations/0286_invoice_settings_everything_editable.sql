-- Everything written on an invoice is kept in Invoice Settings, and Finance
-- may edit it as well as the Super Admin.
--
-- Until now the settings held the bank block and the rupee rate, and the rest
-- of the invoice was fixed in code: the company's name, address, phone and
-- mobile numbers and website at the top, the line under each administrative
-- fee, the section headings, the tax's name and the two lines of small print
-- at the foot. Changing an address meant a developer.
--
-- Each new column starts at exactly what the invoice prints today, so nothing
-- changes on a single invoice until somebody edits a setting. A blank optional
-- field leaves its line off the invoice; the company's name and the two titles
-- are required, because an invoice without them is not one.
--
-- account_currency stays, but prints nothing any more: it only drove the
-- "Invoiced in EUR but payable into a PKR account…" note, which is gone from
-- the invoice and the email.
--
-- Writing was Super Admin only (0118). The accounts team keeps these details
-- and now may write them too — Finance, fixed, the same way the roles and
-- staff management are fixed rather than switches on Role Permissions.

do $$
begin
  if to_regclass('public.invoice_settings') is null then
    raise exception '0286: public.invoice_settings is missing (0118)';
  end if;
  if not exists (select 1 from public.invoice_settings where id) then
    raise exception '0286: the invoice_settings row is missing';
  end if;
end $$;

alter table public.invoice_settings
  add column if not exists company_name text not null default 'HMARK Consultants',
  add column if not exists company_address text not null
    default E'Suite 101, Dashityar Chambers, University Road, Gulshan-e-Iqbal, Block 13-C\nKarachi, Sindh\nPakistan',
  add column if not exists company_phone text default '+92 213 4999777',
  add column if not exists company_mobile text default '+92 334 3297870',
  add column if not exists company_email text,
  add column if not exists company_website text default 'www.hmarkconsultants.com',
  add column if not exists invoice_title text not null default 'INVOICE',
  add column if not exists receipt_title text not null default 'RECEIPT',
  add column if not exists bill_to_label text not null default 'BILL TO',
  add column if not exists admin_fee_note text default 'The administrative fee is non-refundable in any case.',
  add column if not exists tax_label text not null default 'SRB Tax',
  add column if not exists payment_heading text not null default 'PAYMENT INSTRUCTIONS',
  add column if not exists schedule_heading text not null default 'PAYMENT SCHEDULE',
  add column if not exists footer_note text
    default E'Instalments unpaid past their due date may delay document submission on the student''s application. For queries, contact accounts@hmarkconsultants.com.\nHMARK Consultants reserves the rights, in its sole discretion, to cancel the scholarship or admission.';

-- The required ones cannot be saved blank.
alter table public.invoice_settings drop constraint if exists invoice_settings_required_text;
alter table public.invoice_settings add constraint invoice_settings_required_text check (
  btrim(company_name) <> '' and btrim(invoice_title) <> '' and btrim(receipt_title) <> ''
  and btrim(bill_to_label) <> '' and btrim(tax_label) <> ''
  and btrim(payment_heading) <> '' and btrim(schedule_heading) <> ''
);

comment on column public.invoice_settings.account_currency is
  'No longer printed. It drove the currency-conversion note, removed from invoices and emails in 0286.';

drop policy if exists "super admin writes invoice settings" on public.invoice_settings;
drop policy if exists "super admin and finance write invoice settings" on public.invoice_settings;
create policy "super admin and finance write invoice settings" on public.invoice_settings
  for update using (has_role(array['super_admin', 'finance']::staff_role[]))
  with check (has_role(array['super_admin', 'finance']::staff_role[]));
