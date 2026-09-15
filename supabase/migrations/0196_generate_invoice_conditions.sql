-- generate_invoice learns about event-based due dates, and stamps the rate.
--
-- Both have to happen inside this function rather than in a follow-up update:
-- the whole point of the RPC (0090) is that an invoice and its installments
-- commit or fail together, and a rate written afterwards could be missing
-- from an invoice that already exists.
--
-- Signature unchanged apart from the installment payload, which now honours a
-- due_condition alongside due_date. Callers that send neither still get the
-- old behaviour, and the CHECK added in 0195 catches an installment that has
-- no date and no condition.
create or replace function public.generate_invoice(
  p_student_id uuid, p_agreement_id uuid, p_admin_charge numeric, p_consultancy_fee numeric,
  p_currency text, p_intake text, p_terms text, p_invoice_number text, p_installment_plan text,
  p_installments jsonb, p_discount_amount numeric default 0, p_discount_reason text default null,
  p_tax_rate numeric default 0, p_tax_amount numeric default 0
)
returns uuid
language plpgsql
security definer
as $function$
declare
  v_invoice_id uuid;
  v_item jsonb;
  v_rate numeric;
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

  -- Read once and stamped onto the row, so correcting the rate in Setup
  -- tomorrow does not restate a receipt issued today.
  select pkr_per_eur into v_rate from invoice_settings where id = true;

  insert into invoices (
    student_id, agreement_id, admin_charge, consultancy_fee, currency, intake, terms,
    invoice_number, installment_plan, generated_by,
    discount_amount, discount_reason, tax_rate, tax_amount, pkr_per_eur
  )
  values (
    p_student_id, p_agreement_id, p_admin_charge, p_consultancy_fee, p_currency, p_intake, p_terms,
    p_invoice_number, p_installment_plan, auth.uid(),
    coalesce(p_discount_amount, 0), p_discount_reason, coalesce(p_tax_rate, 0), coalesce(p_tax_amount, 0),
    v_rate
  )
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_installments)
  loop
    insert into invoice_installments (invoice_id, installment_no, amount, status, due_date, due_condition)
    values (
      v_invoice_id,
      (v_item ->> 'installment_no')::int,
      (v_item ->> 'amount')::numeric,
      'unpaid',
      nullif(v_item ->> 'due_date', '')::date,
      nullif(v_item ->> 'due_condition', '')
    );
  end loop;

  return v_invoice_id;
end;
$function$;
