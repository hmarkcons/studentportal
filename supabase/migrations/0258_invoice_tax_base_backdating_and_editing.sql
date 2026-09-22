-- Four changes the office asked for, and one of them moves money.
--
-- 1. SRB tax is charged on the whole invoice, not just the services.
--
--    It used to skip the administrative fee: tax was 5% of the discounted
--    consultancy fee plus any added items. It is now 5% of all of that plus
--    the administrative fee, with the discount still coming off first, since
--    tax is not owed on money that was never charged.
--
--    That changes what an invoice totals — on an 1800 fee with a 300
--    administrative fee, from 2190 to 2205 — so it cannot simply be switched
--    on. Every invoice records which rule raised it. Existing rows are stamped
--    'services' and keep their figures for ever; new ones default to 'total'.
--    A receipt in a student's hands must never restate itself, which is the
--    same reason tax_rate is stored per invoice rather than read from today's
--    constant (0196).
--
-- 2. An invoice can be dated. Finance sometimes has to raise one against a
--    date that has passed — an intake closed last month, a payment already
--    taken. issued_on is what the document shows. created_at is left alone, so
--    when it was really raised is still on record and the audit log still
--    tells the truth. Null means "use created_at", which is every invoice
--    raised before today.
--
-- 3. An added item can carry a description. name is a label on a line; some
--    items need a sentence saying what the student is paying for.
--
-- 4. The number of instalments can be changed after the fact. Splitting that
--    out into its own function because it is the one edit that has to delete
--    rows: a settled instalment is a record of money that changed hands and is
--    never touched, so only the outstanding tail is replaced.

-- ---------------------------------------------------------------- tax base
alter table public.invoices
  add column if not exists tax_base text not null default 'services';

alter table public.invoices
  drop constraint if exists invoices_tax_base_check;
alter table public.invoices
  add constraint invoices_tax_base_check check (tax_base in ('services', 'total'));

comment on column public.invoices.tax_base is
  'Which rule priced this invoice''s SRB tax. services = the discounted consultancy fee plus added items, the rule before 0258. total = that plus the administrative fee. Stamped per invoice so an old receipt never restates itself.';

-- Existing rows keep the rule they were raised under; everything new gets the
-- new one. Done in this order deliberately: the default above stamped the
-- existing rows as they stood, and only now does it change for future rows.
alter table public.invoices alter column tax_base set default 'total';

-- --------------------------------------------------------------- back-dating
alter table public.invoices
  add column if not exists issued_on date;

comment on column public.invoices.issued_on is
  'The date the invoice presents itself as, on the PDF, the email and the student''s page. Null falls back to created_at. Set when Finance raises an invoice against a date that has already passed; created_at still records when it was really made.';

-- -------------------------------------------------------- item descriptions
alter table public.invoice_line_items
  add column if not exists description text;

comment on column public.invoice_line_items.description is
  'What the student is paying for, in a sentence. Printed under the item name on the receipt. Optional — name alone is enough for something like "Courier".';

-- --------------------------------------------- generate_invoice, widened again
drop function if exists public.generate_invoice(
  uuid, uuid, numeric, numeric, text, text, text, text, text, jsonb, numeric, text, numeric, numeric, jsonb
);

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
begin
  if not has_role(array['finance', 'super_admin']::staff_role[]) then
    raise exception 'Only Finance/Super Admin can generate invoices.';
  end if;

  if coalesce(p_discount_amount, 0) < 0 then
    raise exception 'Discount cannot be negative.';
  end if;
  if coalesce(p_discount_amount, 0) > coalesce(p_consultancy_fee, 0) then
    raise exception 'Discount cannot exceed the consultancy fee.';
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
    tax_base, issued_on
  )
  values (
    p_student_id, p_agreement_id, p_admin_charge, p_consultancy_fee, p_currency, p_intake, p_terms,
    p_invoice_number, p_installment_plan, auth.uid(),
    coalesce(p_discount_amount, 0), p_discount_reason, coalesce(p_tax_rate, 0), coalesce(p_tax_amount, 0),
    v_rate,
    coalesce(p_tax_base, 'total'), p_issued_on
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

/**
 * Replaces the outstanding part of an invoice's schedule.
 *
 * This is how the number of instalments is changed after the invoice exists.
 * Every instalment with a payment against it is kept exactly as it is — that
 * is a record of money that changed hands — and the rows that are still
 * outstanding are deleted and replaced by the ones given.
 *
 * p_installments is the new outstanding tail, in order:
 *   [{"amount": numeric, "due_date": date|null, "due_condition": text|null,
 *     "extras_amount": numeric}]
 *
 * They are numbered straight after the settled ones, so the schedule still
 * reads 1..n with no gaps. Refuses to leave an invoice with no instalments at
 * all, and refuses to renumber a settled row.
 *
 * SECURITY INVOKER, like split_partial_installment: every write below is
 * governed by the existing invoice_installments policies, so this grants
 * nobody anything they could not already do one statement at a time.
 */
create or replace function public.resize_invoice_schedule(
  p_invoice_id uuid,
  p_installments jsonb
) returns integer
language plpgsql
as $$
declare
  v_student uuid;
  v_settled integer;
  v_max_settled integer;
  v_item jsonb;
  v_no integer;
  v_added integer := 0;
begin
  if not has_role(array['finance', 'super_admin']::staff_role[]) then
    raise exception 'Only Finance/Super Admin can change an invoice schedule.';
  end if;

  select student_id into v_student from public.invoices where id = p_invoice_id for update;
  if v_student is null then
    raise exception 'That invoice no longer exists.';
  end if;

  select count(*), coalesce(max(installment_no), 0)
    into v_settled, v_max_settled
  from public.invoice_installments
  where invoice_id = p_invoice_id and (status = 'paid' or coalesce(amount_paid, 0) > 0);

  -- A settled instalment must keep its number as well as its amount, so the
  -- new tail can only ever be appended after the highest one.
  if v_settled > 0 and v_max_settled <> v_settled then
    raise exception 'The settled instalments on this invoice are not the first ones, so the schedule cannot be resized automatically. Adjust the unpaid instalments individually.';
  end if;

  if jsonb_array_length(coalesce(p_installments, '[]'::jsonb)) = 0 and v_settled = 0 then
    raise exception 'An invoice needs at least one instalment.';
  end if;

  delete from public.invoice_installments
  where invoice_id = p_invoice_id and status <> 'paid' and coalesce(amount_paid, 0) = 0;

  v_no := v_max_settled;
  for v_item in select * from jsonb_array_elements(coalesce(p_installments, '[]'::jsonb))
  loop
    v_no := v_no + 1;
    insert into public.invoice_installments (
      invoice_id, installment_no, amount, status, due_date, due_condition, extras_amount, amount_paid
    )
    values (
      p_invoice_id,
      v_no,
      round((v_item ->> 'amount')::numeric, 2),
      'unpaid',
      nullif(v_item ->> 'due_date', '')::date,
      nullif(v_item ->> 'due_condition', ''),
      round(coalesce((v_item ->> 'extras_amount')::numeric, 0), 2),
      0
    );
    v_added := v_added + 1;
  end loop;

  return v_added;
end;
$$;

revoke all on function public.resize_invoice_schedule(uuid, jsonb) from public;
grant execute on function public.resize_invoice_schedule(uuid, jsonb) to authenticated;
