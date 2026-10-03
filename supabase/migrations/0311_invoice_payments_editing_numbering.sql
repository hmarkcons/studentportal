-- Invoices: undoing a recorded payment, a fully editable schedule, numbering
-- without gaps, and the database following Role Permissions.
--
-- 1. Who may write an invoice is now whoever holds the permission the app
--    already checks: finance.invoices.manage to raise, edit and record
--    payments; finance.invoices.delete to delete one. 0255 tied the policies
--    and the security-definer functions to the Finance and Super Admin roles
--    instead, and said that if the office ever granted the permission to
--    another role, the policies would have to follow. The office has: Role
--    Permissions allows Processing to manage invoices. Until now Processing
--    therefore saw every invoice control, and "Record payment" told them the
--    payment was recorded while the database quietly refused it.
--
-- 2. undo_installment_payment: a payment recorded by mistake is undone — the
--    instalment goes back to unpaid, amount, date and method cleared. A part
--    payment split its instalment into a paid part and a balance (0183); the
--    two are merged back into one unpaid instalment, and the ones after move
--    back up. Refused while the balance itself has a payment or a receipt.
--
-- 3. resize_invoice_schedule keeps the unpaid instalments it can, updating
--    them in place, instead of deleting every one and inserting a new tail.
--    Deleting them took their payment receipts (0308) with them. Only the
--    surplus is deleted when the count drops, and not if it holds a receipt.
--
-- 4. Numbering: the next number is the lowest one from 101 up that no
--    invoice in that run holds, so a deleted invoice's number is the next
--    one given out and no number is skipped. Previously a counter only went
--    up, and a deleted invoice — or a generation that failed — left a gap.
--    invoice_number_counters still remembers how each intake was first
--    spelled; its next_value is no longer read. Invoice numbers are now
--    unique, ignoring case.
--
-- 5. Every invoice is renumbered once, each run from 101 in the order the
--    invoices were raised (HMC-2026-136 … -153, with gaps, become
--    HMC-2026-101 … -111). Their PDFs are rebuilt by the app afterwards.
--
-- Refuses to run if what it builds on is missing.

do $$
begin
  if to_regprocedure('public.staff_has_permission(text)') is null then
    raise exception '0311: public.staff_has_permission(text) is missing (0248)';
  end if;
  if to_regclass('public.payment_receipts') is null then
    raise exception '0311: public.payment_receipts is missing (0308)';
  end if;
  if not exists (select 1 from public.permission_definitions where key = 'finance.invoices.manage')
     or not exists (select 1 from public.permission_definitions where key = 'finance.invoices.delete') then
    raise exception '0311: the invoice permissions are not defined';
  end if;
end $$;

-- ------------------------------------------------------------- 1. who writes

create or replace function public.can_manage_invoices() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_staff() and public.staff_has_permission('finance.invoices.manage');
$$;

create or replace function public.can_delete_invoices() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_staff() and public.staff_has_permission('finance.invoices.delete');
$$;

grant execute on function public.can_manage_invoices() to authenticated;
grant execute on function public.can_delete_invoices() to authenticated;

drop policy if exists "invoices_write" on public.invoices;
drop policy if exists "invoices_insert" on public.invoices;
drop policy if exists "invoices_update" on public.invoices;
drop policy if exists "invoices_delete" on public.invoices;
create policy "invoices_insert" on public.invoices for insert with check (public.can_manage_invoices());
create policy "invoices_update" on public.invoices for update using (public.can_manage_invoices()) with check (public.can_manage_invoices());
create policy "invoices_delete" on public.invoices for delete using (public.can_delete_invoices());

-- Deleting an invoice deletes its instalments first, so a delete here is
-- either part of that, or a schedule being resized or a part payment undone —
-- all of which are managing the invoice.
drop policy if exists "invoice_installments_write" on public.invoice_installments;
create policy "invoice_installments_write" on public.invoice_installments for all
  using (public.can_manage_invoices() or public.can_delete_invoices())
  with check (public.can_manage_invoices());

drop policy if exists "invoice_line_items_write" on public.invoice_line_items;
create policy "invoice_line_items_write" on public.invoice_line_items for all
  using (public.can_manage_invoices()) with check (public.can_manage_invoices());

drop policy if exists "invoice_admin_charges_write" on public.invoice_admin_charges;
create policy "invoice_admin_charges_write" on public.invoice_admin_charges for all
  using (public.can_manage_invoices()) with check (public.can_manage_invoices());

drop policy if exists "invoice_email_log_write" on public.invoice_email_log;
create policy "invoice_email_log_write" on public.invoice_email_log for insert
  with check (public.can_manage_invoices());

-- ------------------------------------------------- 2. undoing a payment

/*
 * SECURITY INVOKER, as split_partial_installment is: every write below is one
 * the caller may already make, statement by statement.
 */
create or replace function public.undo_installment_payment(p_installment_id uuid) returns void
language plpgsql set search_path = public as $$
declare
  v public.invoice_installments%rowtype;
  bal public.invoice_installments%rowtype;
  v_receipts integer;
begin
  if not public.can_manage_invoices() then
    raise exception 'Only those who can record a payment can undo one.';
  end if;

  select * into v from public.invoice_installments where id = p_installment_id for update;
  if not found then
    raise exception 'That instalment no longer exists.';
  end if;
  if v.status <> 'paid' and coalesce(v.amount_paid, 0) = 0 then
    raise exception 'Instalment % has no payment recorded.', v.installment_no;
  end if;

  -- A part payment closed this instalment at what was paid and put the
  -- balance in the one straight after it, marked as carried from it (0183).
  select * into bal from public.invoice_installments
  where invoice_id = v.invoice_id
    and installment_no = v.installment_no + 1
    and carried_from_installment_no = v.installment_no
  for update;

  if found then
    if bal.status = 'paid' or coalesce(bal.amount_paid, 0) > 0 then
      raise exception 'The balance of this part payment, instalment %, has a payment recorded too. Undo that one first.', bal.installment_no;
    end if;
    select count(*) into v_receipts from public.payment_receipts where installment_id = bal.id;
    if v_receipts > 0 then
      raise exception 'The balance, instalment %, has payment receipts attached. A Super Admin can delete them first.', bal.installment_no;
    end if;

    -- An item placed on the balance is placed on the instalment it rejoins.
    update public.invoice_line_items set placement_installment_id = v.id where placement_installment_id = bal.id;
    delete from public.invoice_installments where id = bal.id;

    -- The ones after it move back up. Two passes, for the same reason as the
    -- split: (invoice_id, installment_no) is unique.
    update public.invoice_installments
    set installment_no = -(installment_no - 1)
    where invoice_id = v.invoice_id and installment_no > bal.installment_no;
    update public.invoice_installments
    set installment_no = -installment_no
    where invoice_id = v.invoice_id and installment_no < 0;

    update public.invoice_installments
    set amount = round(v.amount + bal.amount, 2),
        extras_amount = round(coalesce(v.extras_amount, 0) + coalesce(bal.extras_amount, 0), 2),
        status = 'unpaid',
        amount_paid = 0,
        paid_date = null,
        payment_method = null
    where id = v.id;
  else
    update public.invoice_installments
    set status = 'unpaid', amount_paid = 0, paid_date = null, payment_method = null
    where id = v.id;
  end if;
end;
$$;

revoke all on function public.undo_installment_payment(uuid) from public;
grant execute on function public.undo_installment_payment(uuid) to authenticated;

-- ------------------------------------------- 3. resizing, keeping rows

/*
 * p_installments: the unpaid tail as it should be, in order —
 *   [{"amount": numeric, "due_date": "YYYY-MM-DD" | null,
 *     "due_condition": text | null, "extras_amount": numeric}]
 *
 * SECURITY INVOKER: every write is governed by the instalment policies.
 */
create or replace function public.resize_invoice_schedule(
  p_invoice_id uuid,
  p_installments jsonb
) returns integer
language plpgsql set search_path = public as $$
declare
  v_student uuid;
  v_settled integer;
  v_max_settled integer;
  v_open uuid[];
  v_open_count integer;
  v_target integer;
  v_receipts integer;
  v_item jsonb;
  v_i integer := 0;
  v_no integer;
begin
  if not public.can_manage_invoices() then
    raise exception 'You may not change this invoice''s schedule.';
  end if;

  select student_id into v_student from public.invoices where id = p_invoice_id for update;
  if v_student is null then
    raise exception 'That invoice no longer exists.';
  end if;

  select count(*), coalesce(max(installment_no), 0)
    into v_settled, v_max_settled
  from public.invoice_installments
  where invoice_id = p_invoice_id and (status = 'paid' or coalesce(amount_paid, 0) > 0);

  if v_settled > 0 and v_max_settled <> v_settled then
    raise exception 'The settled instalments on this invoice are not the first ones, so the schedule cannot be resized automatically. Adjust the unpaid instalments individually.';
  end if;

  v_target := jsonb_array_length(coalesce(p_installments, '[]'::jsonb));
  if v_target = 0 and v_settled = 0 then
    raise exception 'An invoice needs at least one instalment.';
  end if;

  select coalesce(array_agg(id order by installment_no), '{}')
    into v_open
  from public.invoice_installments
  where invoice_id = p_invoice_id and status <> 'paid' and coalesce(amount_paid, 0) = 0;
  v_open_count := coalesce(array_length(v_open, 1), 0);

  -- Fewer instalments: the last unpaid ones go — unless one holds a receipt.
  if v_open_count > v_target then
    select count(*) into v_receipts from public.payment_receipts where installment_id = any(v_open[v_target + 1:v_open_count]);
    if v_receipts > 0 then
      raise exception 'An unpaid instalment that would be removed has payment receipts attached. A Super Admin can delete them first, or keep more instalments.';
    end if;
    delete from public.invoice_installments where id = any(v_open[v_target + 1:v_open_count]);
  end if;

  -- The kept ones step aside before taking their new numbers, so no two ever
  -- share one on the way.
  update public.invoice_installments set installment_no = -installment_no
  where id = any(v_open[1:least(v_open_count, v_target)]);

  v_no := v_max_settled;
  for v_item in select * from jsonb_array_elements(coalesce(p_installments, '[]'::jsonb))
  loop
    v_i := v_i + 1;
    v_no := v_no + 1;
    if v_i <= v_open_count then
      update public.invoice_installments
      set installment_no = v_no,
          amount = round((v_item ->> 'amount')::numeric, 2),
          due_date = nullif(v_item ->> 'due_date', '')::date,
          due_condition = nullif(v_item ->> 'due_condition', ''),
          extras_amount = round(coalesce((v_item ->> 'extras_amount')::numeric, 0), 2)
      where id = v_open[v_i];
    else
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
    end if;
  end loop;

  return v_target;
end;
$$;

-- ------------------------------------------------------- 4. numbering

create or replace function public.next_invoice_number(p_intake text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_label text;
  v_key text;
  v_n integer;
begin
  if not is_active_staff() then
    raise exception 'Only staff can generate a receipt number.';
  end if;

  -- No intake recorded still needs a number, so the year stands in as the
  -- bucket. Whitespace collapsed, and nothing awkward in a file name.
  v_label := nullif(btrim(coalesce(p_intake, '')), '');
  if v_label is null then
    v_label := to_char(now(), 'YYYY');
  end if;
  v_label := btrim(regexp_replace(regexp_replace(v_label, '[\\/:*?"<>|]', '', 'g'), '\s+', ' ', 'g'));
  if v_label = '' then
    v_label := to_char(now(), 'YYYY');
  end if;
  v_key := lower(v_label);

  -- The run keeps the spelling it began with, whatever case a later intake
  -- is typed in.
  insert into invoice_number_counters (intake_key, intake_label, next_value, updated_at)
  values (v_key, v_label, 101, now())
  on conflict (intake_key) do update set updated_at = now()
  returning intake_label into v_label;

  -- The lowest number from 101 up that no invoice holds. Two staff asking at
  -- once take turns here; should both still land on one number, the unique
  -- index refuses the second invoice and the app asks again.
  perform pg_advisory_xact_lock(hashtext('next_invoice_number:' || v_key));
  select min(n) into v_n
  from generate_series(101, 101 + (select count(*)::integer from invoices)) as n
  where not exists (
    select 1 from invoices i where lower(i.invoice_number) = lower('HMC-' || v_label || '-' || n)
  );

  return 'HMC-' || v_label || '-' || v_n::text;
end;
$$;

grant execute on function public.next_invoice_number(text) to authenticated;

-- ---------------------------------------------- 5. renumbering, once

-- Each HMC run from 101, in the order its invoices were raised. A number
-- typed by hand in another shape is left as it is.
with runs as (
  select id, created_at, substring(invoice_number from '^HMC-(.+)-[0-9]+$') as label
  from public.invoices
  where invoice_number ~ '^HMC-.+-[0-9]+$'
),
renumbered as (
  select id, 'HMC-' || label || '-' || (100 + row_number() over (partition by lower(label) order by created_at, id))::text as number
  from runs
)
update public.invoices i
set invoice_number = r.number
from renumbered r
where i.id = r.id and i.invoice_number is distinct from r.number;

create unique index if not exists invoices_invoice_number_unique
  on public.invoices (lower(invoice_number)) where invoice_number is not null;

-- ------------------------------------- the definer functions' guard
--
-- generate_invoice, issue_receipt_token and apply_invoice_line_item_change
-- follow, as their latest definitions with only the role check changed to
-- public.can_manage_invoices().

-- generate_invoice, from 0279_visa_only_service.sql.
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

-- issue_receipt_token, from 0118_invoice_discount_tax_bank_settings.sql.
create or replace function issue_receipt_token(p_invoice_id uuid, p_days int default 90)
returns uuid
language plpgsql security definer as $$
declare
  v_token uuid;
begin
  if not public.can_manage_invoices() then
    raise exception 'Only Finance/Super Admin can send invoices.';
  end if;

  v_token := gen_random_uuid();

  update invoices
     set receipt_token = v_token,
         receipt_token_expires_at = now() + make_interval(days => greatest(p_days, 1))
   where id = p_invoice_id;

  if not found then
    raise exception 'Invoice not found.';
  end if;

  return v_token;
end;
$$;

-- apply_invoice_line_item_change, from 0257_per_country_admin_charges_and_item_placement.sql.
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
  if not public.can_manage_invoices() then
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
