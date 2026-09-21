-- An item added to an invoice reaches the schedule, the student and the receipt.
--
-- invoice_line_items (0056) lets Finance put a product from the fee catalog,
-- or a custom item, on an invoice after it has been raised. The row was
-- written and shown on the staff card — and nowhere else. The instalment
-- schedule was not rebuilt, so paid/outstanding (which are derived from the
-- instalments) never included it; the PDF and the email never read the table;
-- and the student could not read it at all, because the select policy named
-- staff only. An invoice with a courier charge on it printed, was emailed and
-- was collected without the courier charge.
--
-- Three things fix that here. The app side (invoiceMath.ts, invoiceSchedule.ts)
-- now counts the items, taxes them at the invoice's rate and puts them on the
-- first instalment alongside the administrative charge.
--
-- 1. extras_amount on invoice_installments: the part of an instalment that is
--    added items plus their tax. A fresh plan puts it on instalment 1; an item
--    added after money has come in lands on the first unpaid instalment, and
--    this column is how the schedule can still say why that one is bigger.
--
-- 2. Students may read their own invoice's line items, the way they already
--    read the invoice and its instalments (0010).
--
-- 3. apply_invoice_line_item_change: the item and the schedule change commit
--    or fail together. The app computes the new amounts (the tax rule lives in
--    one TypeScript module and is not duplicated here); this function refuses
--    to reprice an instalment that has a payment recorded, checks every row it
--    is handed belongs to the invoice, and locks the invoice so two people
--    adding items at once cannot each plan from the same schedule.

alter table public.invoice_installments
  add column if not exists extras_amount numeric(12, 2) not null default 0;

alter table public.invoice_installments
  drop constraint if exists invoice_installments_extras_amount_nonneg;
alter table public.invoice_installments
  add constraint invoice_installments_extras_amount_nonneg check (extras_amount >= 0);

comment on column public.invoice_installments.extras_amount is
  'The part of this instalment that is added items (invoice_line_items) plus the tax on them. Written by apply_invoice_line_item_change and updateInvoice so the schedule can say where an item landed.';

-- Same shape as invoice_installments_select (0010): the student who owns the
-- invoice, or staff who may view that student, or the finance-side roles.
drop policy if exists "invoice_line_items_select" on public.invoice_line_items;
create policy "invoice_line_items_select" on public.invoice_line_items for select
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_line_items.invoice_id
        and (staff_can_view_student(i.student_id) or is_own_student(i.student_id))
    )
    or has_role(array['finance', 'management', 'super_admin', 'processing']::staff_role[])
  );

/**
 * Adds one item to an invoice or removes one, and re-prices the unpaid
 * instalments the caller names, in a single transaction.
 *
 * p_add           {"product_id": uuid|null, "name": text, "amount": numeric}
 * p_delete_id     the invoice_line_items row to remove
 * p_installments  [{"id": uuid, "amount": numeric, "extras_amount": numeric}]
 * p_tax_amount    the invoice's recomputed tax, stored so the column agrees
 *                 with the rate it is derived from
 *
 * Exactly one of p_add / p_delete_id. Returns the new item's id, or null on a
 * removal.
 *
 * SECURITY INVOKER (the default) on purpose, as split_partial_installment is:
 * every write is governed by the existing invoice policies (0255: finance and
 * super_admin), so this grants nobody anything they could not already do one
 * statement at a time. The role check up front only turns a silent RLS no-op
 * into a message.
 */
create or replace function public.apply_invoice_line_item_change(
  p_invoice_id uuid,
  p_add jsonb default null,
  p_delete_id uuid default null,
  p_installments jsonb default '[]'::jsonb,
  p_tax_amount numeric default null
) returns uuid
language plpgsql
as $$
declare
  v_student uuid;
  v_new_id uuid;
  v_row jsonb;
  v_id uuid;
  v_amount numeric(12, 2);
  v_extras numeric(12, 2);
  v_owner uuid;
  v_status text;
  v_paid numeric(12, 2);
  v_name text;
  v_item_amount numeric(12, 2);
  v_product uuid;
begin
  if not has_role(array['finance', 'super_admin']::staff_role[]) then
    raise exception 'Only Finance/Super Admin can change the items on an invoice.';
  end if;

  if (p_add is null) = (p_delete_id is null) then
    raise exception 'Add one item or remove one — not both, and not neither.';
  end if;

  -- Serialises changes to one invoice. Without the lock two people adding
  -- items together would each plan from the same schedule, and the second
  -- write would overwrite the first's instalment amounts.
  select student_id into v_student
  from public.invoices
  where id = p_invoice_id
  for update;

  if v_student is null then
    raise exception 'That invoice no longer exists.';
  end if;

  if p_add is not null then
    v_name := nullif(trim(p_add ->> 'name'), '');
    v_item_amount := round((p_add ->> 'amount')::numeric, 2);
    v_product := nullif(p_add ->> 'product_id', '')::uuid;

    if v_name is null then
      raise exception 'The item needs a name.';
    end if;
    if v_item_amount is null or v_item_amount <= 0 then
      raise exception 'The item needs an amount above zero.';
    end if;

    insert into public.invoice_line_items (invoice_id, product_id, name, amount)
    values (p_invoice_id, v_product, v_name, v_item_amount)
    returning id into v_new_id;
  else
    delete from public.invoice_line_items
    where id = p_delete_id and invoice_id = p_invoice_id;
    if not found then
      raise exception 'That item is not on this invoice.';
    end if;
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_installments, '[]'::jsonb))
  loop
    v_id := (v_row ->> 'id')::uuid;
    v_amount := round((v_row ->> 'amount')::numeric, 2);
    v_extras := round(coalesce((v_row ->> 'extras_amount')::numeric, 0), 2);

    select invoice_id, status, coalesce(amount_paid, 0)
      into v_owner, v_status, v_paid
    from public.invoice_installments
    where id = v_id;

    if v_owner is null or v_owner <> p_invoice_id then
      raise exception 'Instalment % is not on this invoice.', v_id;
    end if;
    -- A settled or part-settled instalment is a record of money that changed
    -- hands. The app never asks for this; refusing it here means the app
    -- cannot be talked into it either.
    if v_status = 'paid' or v_paid > 0 then
      raise exception 'An instalment with a payment recorded cannot be repriced.';
    end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'An instalment must be above zero.';
    end if;
    if v_extras < 0 then
      raise exception 'extras_amount cannot be negative.';
    end if;

    update public.invoice_installments
    set amount = v_amount, extras_amount = v_extras
    where id = v_id;
  end loop;

  if p_tax_amount is not null then
    update public.invoices set tax_amount = round(p_tax_amount, 2) where id = p_invoice_id;
  end if;

  return v_new_id;
end;
$$;

revoke all on function public.apply_invoice_line_item_change(uuid, jsonb, uuid, jsonb, numeric) from public;
grant execute on function public.apply_invoice_line_item_change(uuid, jsonb, uuid, jsonb, numeric) to authenticated;
