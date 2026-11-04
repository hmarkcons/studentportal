-- An agreement's own figures are in its own currency.
--
-- 0351 let an agreement be printed in euro or rupees whatever its country's
-- fee currency, and kept every figure the agreement itself holds — an admin
-- charge or consultancy fee typed over the country's, the discount, a visa
-- service fee, the family's fees — in the country's currency, converting them
-- only when printing. The office asked for the opposite (2026-11-05): an
-- agreement in rupees is in rupees throughout, and what is typed on it is
-- typed in rupees. So from now on (the app from this commit):
--
--   * what the agreement holds is in agreements.currency — or, where that is
--     null (every agreement before 0351), in its country's fee currency, which
--     is what those always held;
--   * only what it takes from its country (Setup → Destinations) is converted,
--     at the agreement's pkr_per_eur.
--
-- The agreements made between 0351 and this in the other currency than their
-- country's hold euro figures for a rupee agreement (or the reverse). They
-- are converted here, at their own rate and rounded as the PDF rounds — to the
-- rupee, or to the cent — so each prints exactly what it printed before.
--
-- Run once: the column comment below records it, and a second run finds it
-- and changes nothing.

do $$
declare
  done boolean;
  converted int;
begin
  select coalesce(col_description('public.agreements'::regclass, a.attnum), '') like '%(0352)%'
    into done
    from pg_attribute a
   where a.attrelid = 'public.agreements'::regclass and a.attname = 'currency';
  if done then
    raise notice '0352: already converted, nothing to do';
    return;
  end if;

  with mismatched as (
    select ag.id,
           coalesce(d.consultancy_fee_currency, 'EUR') as from_currency,
           ag.currency as to_currency,
           ag.pkr_per_eur as rate
      from public.agreements ag
      left join public.agreement_templates t on t.id = ag.template_id
      join public.destinations d on d.id = coalesce(ag.destination_id, t.destination_id)
     where ag.currency is not null
       and ag.pkr_per_eur is not null
       and ag.currency <> coalesce(d.consultancy_fee_currency, 'EUR')
  )
  update public.agreements ag
     set admin_charge_override = case
           when m.from_currency = 'EUR' then round(ag.admin_charge_override * m.rate)
           else round(ag.admin_charge_override / m.rate, 2) end,
         consultancy_fee_override = case
           when m.from_currency = 'EUR' then round(ag.consultancy_fee_override * m.rate)
           else round(ag.consultancy_fee_override / m.rate, 2) end,
         discount_amount = case
           when m.from_currency = 'EUR' then round(ag.discount_amount * m.rate)
           else round(ag.discount_amount / m.rate, 2) end,
         visa_service_fee_override = case
           when m.from_currency = 'EUR' then round(ag.visa_service_fee_override * m.rate)
           else round(ag.visa_service_fee_override / m.rate, 2) end,
         spouse_fee = case
           when m.from_currency = 'EUR' then round(ag.spouse_fee * m.rate)
           else round(ag.spouse_fee / m.rate, 2) end,
         child_fee = case
           when m.from_currency = 'EUR' then round(ag.child_fee * m.rate)
           else round(ag.child_fee / m.rate, 2) end
    from mismatched m
   where ag.id = m.id
     and m.from_currency in ('EUR', 'PKR')
     and m.to_currency in ('EUR', 'PKR');
  get diagnostics converted = row_count;
  raise notice '0352: % agreement(s) converted to their own currency', converted;
end
$$;

comment on column public.agreements.currency is
  'EUR or PKR, as chosen when it was made (0351); null = its country''s fee currency (every agreement made before 0351). Every figure the agreement holds — overrides, discount, visa service fee, family fees — is in this currency (0352); only its country''s standard fees are converted, at pkr_per_eur.';
