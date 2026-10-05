-- Rupees per euro, decided by staff for each invoice and each payment.
--
-- The rate was one number in Setup → Invoice settings, stamped on each invoice
-- as it was issued and used for every rupee figure on it — the total, each
-- payment and the balance. The euro moves daily, so a payment made a month
-- after the invoice was shown in rupees at a rate nobody paid at.
--
-- Now:
--
-- 1. An invoice is issued at the rate the person issuing it gives
--    (generate_invoice's p_pkr_per_eur), and keeps it: an issued invoice's
--    rate cannot be changed (trg_invoices_pkr_rate_guard).
--
-- 2. Each payment carries the rate it was received at
--    (invoice_installments.pkr_per_eur). It cannot be changed once recorded —
--    undo the payment and record it again — and undoing a payment clears it.
--
-- 3. Every rate given is kept in pkr_rates: when, by whom, and for which
--    invoice or payment, or set in Setup. Readable by any active staff member;
--    written only by the triggers here, so it cannot be edited or left out.
--    The rate just used becomes invoice_settings.pkr_per_eur, which is what the
--    next invoice or payment is offered.
--
-- Only euro invoices carry a rate. A rupee invoice has nothing to convert, and
-- was being stamped with one all the same (none are on file yet).

-- 1 -------------------------------------------------------------- the log
create table if not exists public.pkr_rates (
  id uuid primary key default gen_random_uuid(),
  rate numeric(10, 2) not null check (rate > 0),
  used_for text not null check (used_for in ('invoice', 'payment', 'setup')),
  invoice_id uuid references public.invoices (id) on delete set null,
  installment_id uuid references public.invoice_installments (id) on delete set null,
  set_by uuid references public.staff (id) on delete set null,
  set_at timestamptz not null default now()
);

create index if not exists pkr_rates_set_at on public.pkr_rates (set_at desc);

comment on table public.pkr_rates is
  'Every rupees-per-euro rate given — for an invoice, for a payment, or in Setup — with when and by whom (0318). Written by triggers only.';

alter table public.pkr_rates enable row level security;
drop policy if exists pkr_rates_select on public.pkr_rates;
create policy pkr_rates_select on public.pkr_rates for select using (public.is_active_staff());
grant select on public.pkr_rates to authenticated;

-- 2 ------------------------------------------------------ a payment's rate
alter table public.invoice_installments
  add column if not exists pkr_per_eur numeric(10, 2) check (pkr_per_eur is null or pkr_per_eur > 0);

comment on column public.invoice_installments.pkr_per_eur is
  'The rupees-per-euro rate this payment was received at (0318). Null while unpaid, on a rupee invoice, and on payments recorded before 0318, which print at the invoice''s own rate.';

-- A rupee invoice has no rate to keep.
update public.invoices set pkr_per_eur = null where currency <> 'EUR' and pkr_per_eur is not null;

-- 3 --------------------------------------------- an issued invoice's rate
create or replace function public.pkr_rate_guard_invoice() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.pkr_per_eur is not null and new.pkr_per_eur is distinct from old.pkr_per_eur then
    raise exception 'An issued invoice keeps the rupee rate it was issued at (PKR % per euro).', old.pkr_per_eur;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoices_pkr_rate_guard on public.invoices;
create trigger trg_invoices_pkr_rate_guard
  before update of pkr_per_eur on public.invoices
  for each row execute function public.pkr_rate_guard_invoice();

-- 4 --------------------------------------------- a recorded payment's rate
create or replace function public.pkr_rate_on_payment() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status <> 'paid' and coalesce(new.amount_paid, 0) = 0 then
    -- Not paid (any more): a payment undone takes its rate with it.
    new.pkr_per_eur := null;
  elsif old.status = 'paid' and new.status = 'paid'
    and old.pkr_per_eur is not null and new.pkr_per_eur is distinct from old.pkr_per_eur then
    raise exception 'A recorded payment keeps the rupee rate it was received at (PKR % per euro). Undo the payment and record it again to change it.', old.pkr_per_eur;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_installments_pkr_rate on public.invoice_installments;
create trigger trg_installments_pkr_rate
  before update on public.invoice_installments
  for each row execute function public.pkr_rate_on_payment();

-- 5 ------------------------------------------------------ keeping the log
-- Security definer: it writes the log, which nobody else may, and the
-- invoice settings, which only Finance and the Super Admin may.
create or replace function public.log_pkr_rate() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_by uuid := (select s.id from staff s where s.id = auth.uid());
begin
  if tg_table_name = 'invoice_settings' then
    -- Set in Setup. A change made from the two branches below is theirs, already logged.
    if pg_trigger_depth() > 1 or new.pkr_per_eur is not distinct from old.pkr_per_eur then
      return null;
    end if;
    insert into pkr_rates (rate, used_for, set_by) values (new.pkr_per_eur, 'setup', v_by);
    return null;
  end if;

  if tg_table_name = 'invoices' then
    if new.pkr_per_eur is null then
      return null;
    end if;
    insert into pkr_rates (rate, used_for, invoice_id, set_by)
    values (new.pkr_per_eur, 'invoice', new.id, coalesce(v_by, (select s.id from staff s where s.id = new.generated_by)));
  else
    if new.pkr_per_eur is null or new.pkr_per_eur is not distinct from old.pkr_per_eur then
      return null;
    end if;
    insert into pkr_rates (rate, used_for, invoice_id, installment_id, set_by)
    values (new.pkr_per_eur, 'payment', new.invoice_id, new.id, v_by);
  end if;

  -- The rate just used is the one the next invoice or payment is offered.
  update invoice_settings set pkr_per_eur = new.pkr_per_eur
  where id = true and pkr_per_eur is distinct from new.pkr_per_eur;
  return null;
end;
$$;

drop trigger if exists trg_invoices_log_pkr_rate on public.invoices;
create trigger trg_invoices_log_pkr_rate
  after insert on public.invoices
  for each row execute function public.log_pkr_rate();

drop trigger if exists trg_installments_log_pkr_rate on public.invoice_installments;
create trigger trg_installments_log_pkr_rate
  after update of pkr_per_eur on public.invoice_installments
  for each row execute function public.log_pkr_rate();

drop trigger if exists trg_invoice_settings_log_pkr_rate on public.invoice_settings;
create trigger trg_invoice_settings_log_pkr_rate
  after update of pkr_per_eur on public.invoice_settings
  for each row execute function public.log_pkr_rate();

-- 6 ------------------------------------------- an invoice's rate, given
drop function if exists public.generate_invoice(uuid, uuid, numeric, numeric, text, text, text, text, text, jsonb, numeric, text, numeric, numeric, jsonb, text, date);

-- generate_invoice, from 0311_invoice_payments_editing_numbering.sql, with
-- the rate given rather than read from Setup.
create or replace function public.generate_invoice(
  p_student_id uuid, p_agreement_id uuid, p_admin_charge numeric, p_consultancy_fee numeric,
  p_currency text, p_intake text, p_terms text, p_invoice_number text, p_installment_plan text,
  p_installments jsonb, p_discount_amount numeric default 0, p_discount_reason text default null,
  p_tax_rate numeric default 0, p_tax_amount numeric default 0,
  p_admin_charges jsonb default '[]'::jsonb,
  p_tax_base text default 'total',
  p_issued_on date default null,
  p_pkr_per_eur numeric default null
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
  if not public.can_manage_invoices() then
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

  -- The rupee rate is the one staff gave for this invoice (0318), falling back
  -- to the latest used for a caller that sends none. A euro invoice only: an
  -- invoice already in rupees has nothing to convert.
  if p_currency = 'EUR' then
    v_rate := p_pkr_per_eur;
    if v_rate is null then
      select pkr_per_eur into v_rate from invoice_settings where id = true;
    end if;
    if v_rate is null or v_rate < 1 or v_rate > 10000 then
      raise exception 'Give the rupees-per-euro rate for this invoice, between 1 and 10,000.';
    end if;
    v_rate := round(v_rate, 2);
  else
    v_rate := null;
  end if;

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

grant execute on function public.generate_invoice(uuid, uuid, numeric, numeric, text, text, text, text, text, jsonb, numeric, text, numeric, numeric, jsonb, text, date, numeric) to authenticated;

-- 7 ------------------------------------------------- the log, from today
-- The rates the invoices on file were issued at, then the one in Setup now,
-- which is the latest.
insert into public.pkr_rates (rate, used_for, invoice_id, set_by, set_at)
select i.pkr_per_eur, 'invoice', i.id, (select s.id from staff s where s.id = i.generated_by), i.created_at
from public.invoices i
where i.pkr_per_eur is not null
  and not exists (select 1 from public.pkr_rates r where r.invoice_id = i.id and r.used_for = 'invoice');

insert into public.pkr_rates (rate, used_for)
select s.pkr_per_eur, 'setup'
from public.invoice_settings s
where s.id = true and not exists (select 1 from public.pkr_rates r where r.used_for = 'setup');
