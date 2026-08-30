-- Two non-atomic multi-write bugs found sweeping the finance workflow:
--
-- 1. generateInvoice() (src/lib/actions/invoices.ts) inserted the `invoices`
--    row and committed it, then inserted `invoice_installments` in a
--    separate call. If the second insert failed, the error was surfaced to
--    the user but the invoice row was already persisted — an invoice with
--    zero installments, invisible to normal payment-tracking UI but still
--    summed into revenue reports that read invoices.admin_charge/
--    consultancy_fee directly.
--
-- 2. createStaffCommission() (src/lib/actions/finance.ts) read a credit's
--    status, inserted the discounted commission row, and only afterward
--    updated the credit to 'applied' — with no row lock between the read
--    and the write. Two concurrent requests applying the same credit could
--    both pass the "status = available" check before either write lands,
--    double-spending one credit across two commissions; and if the final
--    credit-update failed, the discount was already applied with the
--    credit still showing as available for reuse.
--
-- Both fixed the same way: one security-definer function per operation so
-- every write commits or fails together, with `for update` row-locking the
-- credit to close the race window.

create or replace function generate_invoice(
  p_student_id uuid,
  p_agreement_id uuid,
  p_admin_charge numeric,
  p_consultancy_fee numeric,
  p_currency text,
  p_intake text,
  p_terms text,
  p_invoice_number text,
  p_installment_plan text,
  p_installments jsonb
) returns uuid
language plpgsql security definer as $$
declare
  v_invoice_id uuid;
  v_item jsonb;
begin
  if not has_role(array['finance', 'super_admin']::staff_role[]) then
    raise exception 'Only Finance/Super Admin can generate invoices.';
  end if;

  insert into invoices (student_id, agreement_id, admin_charge, consultancy_fee, currency, intake, terms, invoice_number, installment_plan, generated_by)
  values (p_student_id, p_agreement_id, p_admin_charge, p_consultancy_fee, p_currency, p_intake, p_terms, p_invoice_number, p_installment_plan, auth.uid())
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_installments)
  loop
    insert into invoice_installments (invoice_id, installment_no, amount, status, due_date)
    values (
      v_invoice_id,
      (v_item ->> 'installment_no')::int,
      (v_item ->> 'amount')::numeric,
      'unpaid',
      nullif(v_item ->> 'due_date', '')::date
    );
  end loop;

  return v_invoice_id;
end;
$$;

grant execute on function generate_invoice(uuid, uuid, numeric, numeric, text, text, text, text, text, jsonb) to authenticated;

create or replace function create_staff_commission(
  p_staff_id uuid,
  p_student_id uuid,
  p_amount numeric,
  p_currency text,
  p_registration_date date,
  p_apply_credit_id uuid
) returns uuid
language plpgsql security definer as $$
declare
  v_credit staff_commission_credits%rowtype;
  v_final_amount numeric := p_amount;
  v_commission_id uuid;
begin
  if not has_role(array['finance', 'super_admin']::staff_role[]) then
    raise exception 'Only Finance/Super Admin can add commission records.';
  end if;

  if p_apply_credit_id is not null then
    select * into v_credit from staff_commission_credits where id = p_apply_credit_id for update;
    if v_credit is null or v_credit.status <> 'available' or v_credit.staff_id <> p_staff_id then
      raise exception 'That credit is no longer available.';
    end if;
    if v_credit.currency <> p_currency then
      raise exception 'Credit is in %, but this commission is in % — match the currency to apply it.', v_credit.currency, p_currency;
    end if;
    v_final_amount := greatest(0, p_amount - v_credit.amount);
  end if;

  insert into staff_commissions (staff_id, student_id, amount, currency, registration_date)
  values (p_staff_id, p_student_id, v_final_amount, p_currency, p_registration_date)
  returning id into v_commission_id;

  if p_apply_credit_id is not null then
    update staff_commission_credits
    set status = 'applied', applied_to_commission_id = v_commission_id, applied_at = now()
    where id = p_apply_credit_id;
  end if;

  return v_commission_id;
end;
$$;

grant execute on function create_staff_commission(uuid, uuid, numeric, text, date, uuid) to authenticated;
