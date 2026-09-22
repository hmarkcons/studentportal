-- Two things an invoice could not say, and one it could not be asked.
--
-- 1. A student registers for one primary country and up to three backups
--    (lead_destinations.is_backup, migration 0108). A backup country already
--    gets an administrative-fee-only agreement — no consultancy fee — so the
--    office charges one consultancy fee and one administrative fee PER
--    COUNTRY. The invoice had a single admin_charge column and no idea which
--    country any of it was for, so a student with two backups was either
--    under-billed or billed a lump sum their own agreements did not explain.
--
--    invoice_admin_charges is that breakdown. invoices.admin_charge stays, and
--    stays authoritative for the arithmetic: it holds the SUM. Everything that
--    computes money (computeInvoiceMath, the instalment plan, the payment
--    figures) is unchanged and cannot drift from the breakdown, because the
--    breakdown is for saying WHICH COUNTRY, not for deciding how much.
--
--    The country name is snapshotted onto the row beside destination_id. A
--    receipt in a student's hands must not rename its own charges because
--    somebody edited a destination's display name afterwards — the same reason
--    agreements snapshot is_backup rather than re-reading it (0108).
--
-- 2. An item added to an invoice (invoice_line_items) landed on the next
--    unpaid instalment because that was the only rule there was. Staff are now
--    asked: put it on a particular instalment, or divide it equally across the
--    unpaid ones. placement_installment_id / placement_spread record the
--    answer, so the distribution can be recomputed from the items themselves
--    rather than inferred from the amounts it previously produced.
--
-- 3. generate_invoice writes the per-country breakdown in the same transaction
--    as the invoice and its instalments, for the same reason 0090 made the
--    invoice and instalments atomic: a breakdown written afterwards could be
--    missing from an invoice that already exists.

create table if not exists public.invoice_admin_charges (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  -- Nullable: the destination may be deleted later, and the invoice still has
  -- to be able to print the charge it actually made.
  destination_id uuid references public.destinations (id) on delete set null,
  country_label text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  is_backup boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (invoice_id, destination_id)
);

create index if not exists invoice_admin_charges_invoice_idx
  on public.invoice_admin_charges (invoice_id);

comment on table public.invoice_admin_charges is
  'Which country each slice of invoices.admin_charge is for. The sum of these equals invoices.admin_charge, which remains the figure all invoice arithmetic uses. country_label is a snapshot so an old receipt does not rename its charges.';

alter table public.invoice_admin_charges enable row level security;

-- Same reach as invoice_line_items_select (0256): the student whose invoice it
-- is, staff who may view that student, or the finance-side roles.
drop policy if exists "invoice_admin_charges_select" on public.invoice_admin_charges;
create policy "invoice_admin_charges_select" on public.invoice_admin_charges for select
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_admin_charges.invoice_id
        and (staff_can_view_student(i.student_id) or is_own_student(i.student_id))
    )
    or has_role(array['finance', 'management', 'super_admin', 'processing']::staff_role[])
  );

-- Writes as 0255 settled it for every other invoice table.
drop policy if exists "invoice_admin_charges_write" on public.invoice_admin_charges;
create policy "invoice_admin_charges_write" on public.invoice_admin_charges for all
  using (has_role(array['finance', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'super_admin']::staff_role[]));

-- ---------------------------------------------------------------- placement

alter table public.invoice_line_items
  add column if not exists placement_installment_id uuid
    references public.invoice_installments (id) on delete set null,
  add column if not exists placement_spread boolean not null default false;

comment on column public.invoice_line_items.placement_installment_id is
  'The instalment staff chose to put this item on. Null with placement_spread=false means the item predates the choice and is treated as spread.';
comment on column public.invoice_line_items.placement_spread is
  'True when staff chose to divide this item equally across the unpaid instalments rather than put it on one.';

-- ------------------------------------------------- generate_invoice, widened
--
-- Dropped and recreated rather than overloaded: adding a defaulted parameter
-- to a function of this name would leave two candidates and PostgREST would
-- have to guess between them.
drop function if exists public.generate_invoice(
  uuid, uuid, numeric, numeric, text, text, text, text, text, jsonb, numeric, text, numeric, numeric
);

create or replace function public.generate_invoice(
  p_student_id uuid, p_agreement_id uuid, p_admin_charge numeric, p_consultancy_fee numeric,
  p_currency text, p_intake text, p_terms text, p_invoice_number text, p_installment_plan text,
  p_installments jsonb, p_discount_amount numeric default 0, p_discount_reason text default null,
  p_tax_rate numeric default 0, p_tax_amount numeric default 0,
  p_admin_charges jsonb default '[]'::jsonb
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

  -- The breakdown is a statement about the same money, so it has to add up to
  -- it. Checked here rather than trusted from the caller: admin_charge is what
  -- every figure on the invoice is computed from, and a breakdown that says
  -- something else is a receipt that contradicts its own total.
  if jsonb_array_length(coalesce(p_admin_charges, '[]'::jsonb)) > 0 then
    select coalesce(sum(round((e ->> 'amount')::numeric, 2)), 0)
      into v_breakdown
    from jsonb_array_elements(p_admin_charges) e;

    if abs(v_breakdown - round(coalesce(p_admin_charge, 0), 2)) > 0.005 then
      raise exception 'The per-country administrative charges add up to %, but the invoice total says %.',
        v_breakdown, round(coalesce(p_admin_charge, 0), 2);
    end if;
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

-- ------------------------------------- apply_invoice_line_item_change, widened
--
-- p_add gains placement_installment_id / placement_spread. Same drop-first
-- reasoning as above.
drop function if exists public.apply_invoice_line_item_change(uuid, jsonb, uuid, jsonb, numeric);

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
  v_placement uuid;
  v_spread boolean;
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
    v_placement := nullif(p_add ->> 'placement_installment_id', '')::uuid;
    v_spread := coalesce((p_add ->> 'placement_spread')::boolean, false);

    if v_name is null then
      raise exception 'The item needs a name.';
    end if;
    if v_item_amount is null or v_item_amount <= 0 then
      raise exception 'The item needs an amount above zero.';
    end if;
    if v_placement is not null and v_spread then
      raise exception 'An item goes on one instalment or is divided across them, not both.';
    end if;

    if v_placement is not null then
      select invoice_id, status, coalesce(amount_paid, 0)
        into v_owner, v_status, v_paid
      from public.invoice_installments
      where id = v_placement;

      if v_owner is null or v_owner <> p_invoice_id then
        raise exception 'That instalment is not on this invoice.';
      end if;
      if v_status = 'paid' or v_paid > 0 then
        raise exception 'That instalment has already been paid — choose one that is still outstanding.';
      end if;
    end if;

    insert into public.invoice_line_items (
      invoice_id, product_id, name, amount, placement_installment_id, placement_spread
    )
    values (p_invoice_id, v_product, v_name, v_item_amount, v_placement, v_spread)
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
