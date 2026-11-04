-- An agreement in euro or rupees, and the accompanying family by name.
--
-- 1. The currency an agreement is written in. Every figure on an agreement
--    comes from its country (Setup → Destinations) in that country's fee
--    currency — euro for the public universities, rupees for the private —
--    and was printed in it. Now whoever makes the agreement chooses euro or
--    rupees, and the payment chart and every amount in the wording are
--    converted at a rupees-per-euro rate. The rate is the office's standard
--    (agreement_settings.pkr_per_eur, 335 to begin with, Super Admin edits it
--    in Setup → Agreement templates), offered on the form and changeable there
--    for one agreement. Each agreement keeps the rate it was made at, so a
--    later change to the standard never restates one already made.
--
--    agreements.currency is null on every agreement made before this, which
--    reads as its country's fee currency — exactly what they printed. The
--    amounts typed on the form (an override, a discount) stay in the
--    country's fee currency, as the invoice pre-fills read them; only the
--    printed agreement is converted.
--
-- 2. The accompanying family by name (0350 recorded only how many): each
--    spouse's and child's name and date of birth, entered at registration and
--    copied onto the agreement with the rest of the family when it is made.
--    A list of {relation: "spouse" | "child", name, dob: "YYYY-MM-DD"}.
--    A student reads their own leads row (0022); these are their own family's
--    details, which they give us.

-- 1 ------------------------------------------------------- the standard rate
alter table public.agreement_settings
  add column if not exists pkr_per_eur numeric(10, 2) not null default 335
    constraint agreement_settings_pkr_per_eur check (pkr_per_eur > 0);

comment on column public.agreement_settings.pkr_per_eur is
  'Rupees per euro an agreement is converted at, as standard (0351). Offered when an agreement is made in the other currency than its country''s fees; each agreement keeps its own.';

-- 2 ------------------------------------------------- an agreement's currency
alter table public.agreements
  add column if not exists currency text
    constraint agreements_currency_choice check (currency is null or currency in ('EUR', 'PKR')),
  add column if not exists pkr_per_eur numeric(10, 2)
    constraint agreements_pkr_per_eur_positive check (pkr_per_eur is null or pkr_per_eur > 0),
  add column if not exists family_members jsonb
    constraint agreements_family_members_list check (family_members is null or jsonb_typeof(family_members) = 'array');

comment on column public.agreements.currency is
  'EUR or PKR, as chosen when it was made (0351); null = its country''s fee currency (every agreement made before 0351).';
comment on column public.agreements.pkr_per_eur is
  'The rupees-per-euro rate its figures were converted at (0351); null when it is in its country''s own fee currency.';
comment on column public.agreements.family_members is
  'The accompanying family by name and date of birth, copied from the registration when it was made (0351).';

-- 3 ----------------------------------------------- the family on registration
alter table public.leads
  add column if not exists family_members jsonb not null default '[]'::jsonb
    constraint leads_family_members_list check (jsonb_typeof(family_members) = 'array');

comment on column public.leads.family_members is
  'Each accompanying spouse and child: {relation, name, dob} (0351). Their number and fees are spouse_count / children_count / spouse_fee / child_fee (0350).';

notify pgrst, 'reload schema';
