-- Visa documentation and application only: a client who already holds an
-- admission letter and wants HMARK for the visa alone.
--
-- A student's service is now either the full service (admission and visa)
-- or visa-only. For a visa-only student the admission work is skipped —
-- processing records the admission they already have and uploads the letter —
-- their agreement is a visa-service one, and their invoice charges the visa
-- service fee alone: no administrative charge, no consultancy fee. See
-- src/lib/serviceType.ts.
--
--   leads.service_type                 'full' | 'visa_only'. Only a Super Admin
--                                      or processing may set visa-only or
--                                      change it (guard_lead_service_type).
--   destinations.visa_service_fee      each country's standard fee for the
--                                      visa service, in its consultancy_fee_currency
--   agreement_templates.service_type   which service a template is for
--   agreements.service_type,
--   agreements.visa_service_fee_override   what an agreement was made for, and
--                                      its fee where it differs from the country's
--   invoices.service_type              what an invoice was raised for
--
-- generate_invoice now reads the student's own service and stamps it on the
-- invoice, and refuses an administrative charge on a visa-only invoice — so
-- no form, however it is posted, can raise one with the charges the office
-- said a visa-only client does not pay. For a visa-only invoice the fee is
-- carried in consultancy_fee (the same instalment, discount and tax rules
-- apply to it) and every screen and PDF names it by the service.
--
-- Every existing row is the full service, which is what it always was.

do $$
begin
  if to_regprocedure('public.has_role(staff_role[])') is null then
    raise exception '0279: public.has_role(staff_role[]) is missing (0247)';
  end if;
  if to_regclass('public.invoices') is null or to_regclass('public.agreement_templates') is null then
    raise exception '0279: invoices or agreement_templates is missing';
  end if;
end $$;

-- ----------------------------------------------------------------- columns
alter table public.leads
  add column if not exists service_type text not null default 'full';
alter table public.leads drop constraint if exists leads_service_type_check;
alter table public.leads add constraint leads_service_type_check check (service_type in ('full', 'visa_only'));

alter table public.destinations
  add column if not exists visa_service_fee numeric(12, 2);
alter table public.destinations drop constraint if exists destinations_visa_service_fee_check;
alter table public.destinations add constraint destinations_visa_service_fee_check check (visa_service_fee is null or visa_service_fee >= 0);

alter table public.agreement_templates
  add column if not exists service_type text not null default 'full';
alter table public.agreement_templates drop constraint if exists agreement_templates_service_type_check;
alter table public.agreement_templates add constraint agreement_templates_service_type_check check (service_type in ('full', 'visa_only'));

alter table public.agreements
  add column if not exists service_type text not null default 'full',
  add column if not exists visa_service_fee_override numeric(12, 2);
alter table public.agreements drop constraint if exists agreements_service_type_check;
alter table public.agreements add constraint agreements_service_type_check check (service_type in ('full', 'visa_only'));

alter table public.invoices
  add column if not exists service_type text not null default 'full';
alter table public.invoices drop constraint if exists invoices_service_type_check;
alter table public.invoices add constraint invoices_service_type_check check (service_type in ('full', 'visa_only'));

comment on column public.leads.service_type is
  'full = admission and visa; visa_only = visa documentation and application for a student who already holds an admission. Set by Super Admin or processing only.';
comment on column public.destinations.visa_service_fee is
  'The standard fee for the visa documentation and application service to this country, in consultancy_fee_currency. Pre-fills a visa-only invoice.';

-- ------------------------------------------- who may set a student's service
create or replace function public.guard_lead_service_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No signed-in user: the server itself, or someone at the database.
  if auth.uid() is null then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.service_type is distinct from 'full')
     or (tg_op = 'UPDATE' and new.service_type is distinct from old.service_type) then
    if not public.has_role(array['super_admin', 'processing']::staff_role[]) then
      raise exception 'Only a Super Admin or the processing team can change which service a student is registered for.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lead_service_type_guard on public.leads;
create trigger trg_lead_service_type_guard
  before insert or update of service_type on public.leads
  for each row execute function public.guard_lead_service_type();

-- ------------------------------------------ generate_invoice, service-aware
-- As 0258, with the student's service read and stamped, and a visa-only
-- invoice refused any administrative charge. Same signature, so every caller
-- is unchanged.
create or replace function public.generate_invoice(
  p_student_id uuid, p_agreement_id uuid, p_admin_charge numeric, p_consultancy_fee numeric,
  p_currency text, p_intake text, p_terms text, p_invoice_number text, p_installment_plan text,
  p_installments jsonb, p_discount_amount numeric default 0, p_discount_reason text default null,
  p_tax_rate numeric default 0, p_tax_amount numeric default 0,
  p_admin_charges jsonb default '[]'::jsonb,
  p_tax_base text default 'total',
  p_issued_on date default null
)
returns uuid
language plpgsql
security definer
as $function$
declare
  v_invoice_id uuid;
  v_item jsonb;
  v_rate numeric;
  v_breakdown numeric;
  v_service text;
begin
  if not has_role(array['finance', 'super_admin']::staff_role[]) then
    raise exception 'Only Finance/Super Admin can generate invoices.';
  end if;

  -- 0279: the invoice is for the service the student is registered for.
  select coalesce(service_type, 'full') into v_service from leads where id = p_student_id;
  v_service := coalesce(v_service, 'full');
  if v_service = 'visa_only' then
    if coalesce(p_admin_charge, 0) <> 0 then
      raise exception 'A visa-only student pays the visa service fee alone — there is no administrative charge on their invoice.';
    end if;
    if exists (select 1 from jsonb_array_elements(coalesce(p_admin_charges, '[]'::jsonb)) e where coalesce((e ->> 'amount')::numeric, 0) <> 0) then
      raise exception 'A visa-only student pays the visa service fee alone — there is no administrative charge on their invoice.';
    end if;
  end if;

  if coalesce(p_discount_amount, 0) < 0 then
    raise exception 'Discount cannot be negative.';
  end if;
  if coalesce(p_discount_amount, 0) > coalesce(p_consultancy_fee, 0) then
    raise exception 'Discount cannot exceed the %.', case when v_service = 'visa_only' then 'visa service fee' else 'consultancy fee' end;
  end if;
  if coalesce(p_tax_base, 'total') not in ('services', 'total') then
    raise exception 'Unknown tax base: %', p_tax_base;
  end if;

  if jsonb_array_length(coalesce(p_admin_charges, '[]'::jsonb)) > 0 then
    select coalesce(sum(round((e ->> 'amount')::numeric, 2)), 0)
      into v_breakdown
    from jsonb_array_elements(p_admin_charges) e;

    if abs(v_breakdown - round(coalesce(p_admin_charge, 0), 2)) > 0.005 then
      raise exception 'The per-country administrative charges add up to %, but the invoice total says %.',
        v_breakdown, round(coalesce(p_admin_charge, 0), 2);
    end if;
  end if;

  select pkr_per_eur into v_rate from invoice_settings where id = true;

  insert into invoices (
    student_id, agreement_id, admin_charge, consultancy_fee, currency, intake, terms,
    invoice_number, installment_plan, generated_by,
    discount_amount, discount_reason, tax_rate, tax_amount, pkr_per_eur,
    tax_base, issued_on, service_type
  )
  values (
    p_student_id, p_agreement_id, p_admin_charge, p_consultancy_fee, p_currency, p_intake, p_terms,
    p_invoice_number, p_installment_plan, auth.uid(),
    coalesce(p_discount_amount, 0), p_discount_reason, coalesce(p_tax_rate, 0), coalesce(p_tax_amount, 0),
    v_rate,
    coalesce(p_tax_base, 'total'), p_issued_on, v_service
  )
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_installments)
  loop
    insert into invoice_installments (invoice_id, installment_no, amount, status, due_date, due_condition, extras_amount)
    values (
      v_invoice_id,
      (v_item ->> 'installment_no')::int,
      (v_item ->> 'amount')::numeric,
      'unpaid',
      nullif(v_item ->> 'due_date', '')::date,
      nullif(v_item ->> 'due_condition', ''),
      round(coalesce((v_item ->> 'extras_amount')::numeric, 0), 2)
    );
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_admin_charges, '[]'::jsonb))
  loop
    insert into invoice_admin_charges (invoice_id, destination_id, country_label, amount, is_backup, sort_order)
    values (
      v_invoice_id,
      nullif(v_item ->> 'destination_id', '')::uuid,
      coalesce(nullif(trim(v_item ->> 'country_label'), ''), 'Administrative fee'),
      round((v_item ->> 'amount')::numeric, 2),
      coalesce((v_item ->> 'is_backup')::boolean, false),
      coalesce((v_item ->> 'sort_order')::int, 0)
    );
  end loop;

  return v_invoice_id;
end;
$function$;
