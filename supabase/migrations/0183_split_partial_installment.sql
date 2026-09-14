-- A part-paid installment becomes two: what was paid, and what is still owed.
--
-- A student pays 20,000 of a 50,000 installment on the due date. Until now
-- that installment sat marked 'partial' forever, with no date against the
-- 30,000 still owed — so nothing chased it, the overdue cron could not see a
-- balance with no due date of its own, and the student had no idea when the
-- rest was expected.
--
-- So the installment is split. The original is reduced to what was actually
-- paid and closed; the balance becomes an installment of its own, due a week
-- after the payment by default or on a date staff pick. The schedule still
-- sums to the invoice total, which the payment maths and the agreement's
-- payment chart both rely on.
--
-- Where the balance came from is recorded rather than left to be inferred: in
-- six months nobody should have to work out why a four-installment agreement
-- has five installments against it.

alter table public.invoice_installments
  add column if not exists carried_from_installment_no integer,
  add column if not exists carried_part_paid numeric(12, 2),
  add column if not exists carried_paid_date date;

comment on column public.invoice_installments.carried_from_installment_no is
  'Set on a balance installment created by splitting a part-paid one. The installment number it came from, as it was at the time.';

/**
 * Splits a part-paid installment in two.
 *
 * SECURITY INVOKER (the default) on purpose: every write below is governed by
 * the existing invoice_installments policies, so this grants nobody anything
 * they could not already do one statement at a time.
 */
create or replace function public.split_partial_installment(
  p_installment_id uuid,
  p_amount_paid numeric,
  p_paid_date date,
  p_balance_due_date date,
  p_payment_method text default null
) returns uuid
language plpgsql
as $$
declare
  v_invoice_id uuid;
  v_no integer;
  v_amount numeric(12, 2);
  v_balance numeric(12, 2);
  v_new_id uuid;
begin
  select invoice_id, installment_no, amount
    into v_invoice_id, v_no, v_amount
  from public.invoice_installments
  where id = p_installment_id;

  if v_invoice_id is null then
    raise exception 'That installment no longer exists.';
  end if;

  v_amount := round(v_amount, 2);
  p_amount_paid := round(coalesce(p_amount_paid, 0), 2);

  if p_amount_paid <= 0 then
    raise exception 'Enter how much was actually paid.';
  end if;
  if p_amount_paid >= v_amount then
    raise exception 'That is the whole installment — mark it paid instead of part-paid.';
  end if;
  if p_balance_due_date is null then
    raise exception 'Set a due date for the balance.';
  end if;

  v_balance := round(v_amount - p_amount_paid, 2);

  -- What was actually paid, closed off at that amount.
  update public.invoice_installments
  set amount = p_amount_paid,
      amount_paid = p_amount_paid,
      status = 'paid',
      paid_date = coalesce(p_paid_date, current_date),
      payment_method = coalesce(p_payment_method, payment_method)
  where id = p_installment_id;

  -- Room for the balance immediately after it. Two passes, because
  -- (invoice_id, installment_no) is unique and a single += 1 over a set can
  -- collide part way through depending on the order rows are updated in.
  update public.invoice_installments
  set installment_no = -(installment_no + 1)
  where invoice_id = v_invoice_id and installment_no > v_no;

  update public.invoice_installments
  set installment_no = -installment_no
  where invoice_id = v_invoice_id and installment_no < 0;

  insert into public.invoice_installments (
    invoice_id, installment_no, amount, status, due_date,
    amount_paid, carried_from_installment_no, carried_part_paid, carried_paid_date
  )
  values (
    v_invoice_id, v_no + 1, v_balance, 'unpaid', p_balance_due_date,
    0, v_no, p_amount_paid, coalesce(p_paid_date, current_date)
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function public.split_partial_installment(uuid, numeric, date, date, text) from public;
grant execute on function public.split_partial_installment(uuid, numeric, date, date, text) to authenticated;
