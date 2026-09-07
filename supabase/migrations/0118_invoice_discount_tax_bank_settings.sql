-- Invoice Generator: discount + SRB tax on invoices, HMARK bank details for
-- the "pay to" block, and a tokenised receipt link so the emailed
-- "View receipt" button can open the PDF without a portal login.

-- ---------------------------------------------------------------------------
-- Discount and tax
-- ---------------------------------------------------------------------------
-- Stored on the invoice rather than read live from leads/agreements at render
-- time: an invoice is a financial record, so the numbers it was issued with
-- must not move when someone later edits the student's registration discount.
alter table invoices
  add column if not exists discount_amount numeric(12, 2) not null default 0,
  add column if not exists discount_reason text,
  -- Percent, so a future rate change does not rewrite history. 5 = 5%.
  add column if not exists tax_rate numeric(5, 2) not null default 0,
  add column if not exists tax_amount numeric(12, 2) not null default 0;

-- ---------------------------------------------------------------------------
-- HMARK bank details (singleton, same idiom as office_qr_tokens)
-- ---------------------------------------------------------------------------
create table if not exists invoice_settings (
  id boolean primary key default true,
  bank_name text,
  account_title text,
  account_number text,
  iban text,
  branch text,
  swift_code text,
  -- Shown under the bank block, e.g. "Send proof of payment to accounts@…".
  payment_note text,
  updated_at timestamptz not null default now(),
  constraint invoice_settings_singleton check (id)
);

insert into invoice_settings (id) values (true) on conflict do nothing;

drop trigger if exists trg_invoice_settings_updated_at on invoice_settings;
create trigger trg_invoice_settings_updated_at
  before update on invoice_settings
  for each row execute function set_updated_at();

alter table invoice_settings enable row level security;

-- Any active staff member may read them (they appear on invoices staff issue),
-- but only Super Admin may change where money is sent.
drop policy if exists "staff read invoice settings" on invoice_settings;
create policy "staff read invoice settings" on invoice_settings
  for select using (is_active_staff());

drop policy if exists "super admin writes invoice settings" on invoice_settings;
create policy "super admin writes invoice settings" on invoice_settings
  for update using (has_role(array['super_admin']::staff_role[]))
  with check (has_role(array['super_admin']::staff_role[]));

-- ---------------------------------------------------------------------------
-- Tokenised receipt link
-- ---------------------------------------------------------------------------
-- The emailed button must open the PDF in a new tab. A student may not have a
-- portal login, so the link carries an unguessable token with an expiry
-- instead of relying on a session. Never expose invoices.id in that URL.
alter table invoices
  add column if not exists receipt_token uuid,
  add column if not exists receipt_token_expires_at timestamptz;

create unique index if not exists invoices_receipt_token_key
  on invoices (receipt_token) where receipt_token is not null;

-- ---------------------------------------------------------------------------
-- generate_invoice: carry discount and tax through the atomic write
-- ---------------------------------------------------------------------------
-- Dropped rather than overloaded: two signatures differing only by trailing
-- params invite an ambiguous-call error at runtime.
drop function if exists generate_invoice(uuid, uuid, numeric, numeric, text, text, text, text, text, jsonb);

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
  p_installments jsonb,
  p_discount_amount numeric default 0,
  p_discount_reason text default null,
  p_tax_rate numeric default 0,
  p_tax_amount numeric default 0
) returns uuid
language plpgsql security definer as $$
declare
  v_invoice_id uuid;
  v_item jsonb;
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

  insert into invoices (
    student_id, agreement_id, admin_charge, consultancy_fee, currency, intake, terms,
    invoice_number, installment_plan, generated_by,
    discount_amount, discount_reason, tax_rate, tax_amount
  )
  values (
    p_student_id, p_agreement_id, p_admin_charge, p_consultancy_fee, p_currency, p_intake, p_terms,
    p_invoice_number, p_installment_plan, auth.uid(),
    coalesce(p_discount_amount, 0), p_discount_reason, coalesce(p_tax_rate, 0), coalesce(p_tax_amount, 0)
  )
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

grant execute on function generate_invoice(
  uuid, uuid, numeric, numeric, text, text, text, text, text, jsonb, numeric, text, numeric, numeric
) to authenticated;

-- ---------------------------------------------------------------------------
-- Issuing a receipt link
-- ---------------------------------------------------------------------------
-- Security definer so the token is minted server-side on send, and rotating it
-- invalidates any previously emailed link.
create or replace function issue_receipt_token(p_invoice_id uuid, p_days int default 90)
returns uuid
language plpgsql security definer as $$
declare
  v_token uuid;
begin
  if not has_role(array['finance', 'super_admin']::staff_role[]) then
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

grant execute on function issue_receipt_token(uuid, int) to authenticated;
