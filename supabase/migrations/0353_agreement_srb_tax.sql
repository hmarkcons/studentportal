-- SRB tax on a student's agreement.
--
-- An invoice has charged Sindh Revenue Board tax since 0118 — 5% on the whole
-- invoice after the discount since 0258 — but the agreement the student signs
-- said nothing about it, so the invoice asked for more than the agreement's
-- total. The agreement now says it: an "SRB Tax (5%)" row in its payment
-- chart, on the total after the discount, and a Total Professional Fee that
-- includes it.
--
-- The percentage is chosen when the agreement is made — 5 as standard, any
-- figure from 0 to 100 — and kept on it, so the agreement always prints what
-- was signed. Null on every agreement made before this: they were signed
-- without tax on them and print as they always did. An invoice raised on the
-- agreement opens on its rate (invoices.tax_rate is per invoice already).

alter table public.agreements
  add column if not exists tax_rate numeric(5, 2)
    constraint agreements_tax_rate_range check (tax_rate is null or (tax_rate >= 0 and tax_rate <= 100));

comment on column public.agreements.tax_rate is
  'SRB tax percent on the total after discount, as chosen when it was made (0353); null = no tax (every agreement before 0353).';

notify pgrst, 'reload schema';
