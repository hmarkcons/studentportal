-- Payment receipts: proof of a payment, attached to the payment itself.
--
-- Five kinds of payment, each a row in a table of its own:
--
--   installment        a consultancy fee instalment a registered student paid
--                      (invoice_installments — one payment each; a part
--                      payment splits the row, and the paid part keeps it)
--   staff_commission   a commission paid to a staff member (staff_commissions)
--   payroll            a month's salary paid to a staff member (staff_payroll)
--   refund             a refund paid back to a student (refund_requests)
--   referral           a commission paid to a referring party (referrals)
--
-- Each may carry several receipts — a bank slip and a screenshot — each with
-- who uploaded it and when. A receipt is a record of proof, not of payment:
-- it never changes a payment's status, and a payment needs none to be paid.
--
-- Who may upload, open and remove them is whoever may mark that payment paid,
-- by the same permission the app checks:
--
--   installment                  finance.invoices.manage
--   staff_commission, payroll    finance.commissions.manage
--   refund                       finance.refunds.review
--   referral                     marketing.referral_incentives
--
-- and nobody else: not the student or staff member who was paid, nor a
-- counsellor. staff_has_permission() answers for whoever is asking, so a
-- permission granted on the Role Permissions screen carries the receipts with
-- it.
--
-- The files are in the private documents bucket under
-- payment-receipts/<kind>/<payment id>/…, a prefix no existing documents
-- policy reaches: those key on a student or commission id as the first
-- folder, read through safe_uuid(), which is null for this one.
--
-- staff_commissions.payment_proof_path held one proof per commission and is
-- superseded by this; it is empty on every row, so nothing moves.
--
-- Refuses to run if what it builds on is missing.

do $$
declare
  k text;
begin
  if to_regprocedure('public.staff_has_permission(text)') is null then
    raise exception '0308: public.staff_has_permission(text) is missing (0248)';
  end if;
  if to_regprocedure('public.is_active_staff()') is null then
    raise exception '0308: public.is_active_staff() is missing';
  end if;
  foreach k in array array['finance.invoices.manage', 'finance.commissions.manage', 'finance.refunds.review', 'marketing.referral_incentives'] loop
    if not exists (select 1 from public.permission_definitions where key = k) then
      raise exception '0308: permission % is not defined', k;
    end if;
  end loop;
  if exists (select 1 from public.staff_commissions where payment_proof_path is not null) then
    raise exception '0308: a staff commission has a payment_proof_path — move it to payment_receipts first';
  end if;
end $$;

-- ------------------------------------------------------------ permissions

create or replace function public.payment_receipt_permission(p_kind text) returns text
language sql immutable set search_path = public as $$
  select case p_kind
    when 'installment' then 'finance.invoices.manage'
    when 'staff_commission' then 'finance.commissions.manage'
    when 'payroll' then 'finance.commissions.manage'
    when 'refund' then 'finance.refunds.review'
    when 'referral' then 'marketing.referral_incentives'
  end;
$$;

-- False for a kind that is not one of the five, Super Admin included:
-- staff_has_permission() says yes to a Super Admin for any key, null too.
create or replace function public.can_manage_payment_receipts(p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.payment_receipt_permission(p_kind) is not null
     and public.is_active_staff()
     and public.staff_has_permission(public.payment_receipt_permission(p_kind));
$$;

grant execute on function public.payment_receipt_permission(text) to authenticated;
grant execute on function public.can_manage_payment_receipts(text) to authenticated;

-- ------------------------------------------------------------------ table

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('installment', 'staff_commission', 'payroll', 'refund', 'referral')),
  installment_id uuid references public.invoice_installments (id) on delete cascade,
  staff_commission_id uuid references public.staff_commissions (id) on delete cascade,
  payroll_id uuid references public.staff_payroll (id) on delete cascade,
  refund_id uuid references public.refund_requests (id) on delete cascade,
  referral_id uuid references public.referrals (id) on delete cascade,
  path text not null unique,
  file_name text not null check (length(file_name) between 1 and 255),
  size_bytes integer check (size_bytes >= 0),
  content_type text,
  uploaded_by uuid references public.staff (id) on delete set null default auth.uid(),
  uploaded_at timestamptz not null default now(),

  -- One payment, and the column for its kind.
  constraint payment_receipts_one_payment check (
    num_nonnulls(installment_id, staff_commission_id, payroll_id, refund_id, referral_id) = 1
    and case kind
      when 'installment' then installment_id is not null
      when 'staff_commission' then staff_commission_id is not null
      when 'payroll' then payroll_id is not null
      when 'refund' then refund_id is not null
      when 'referral' then referral_id is not null
    end
  ),
  -- The file is in that payment's own folder, so a row cannot point at some
  -- other document and lend it this table's access.
  constraint payment_receipts_path_in_folder check (
    path like 'payment-receipts/' || kind || '/'
      || coalesce(installment_id, staff_commission_id, payroll_id, refund_id, referral_id)::text || '/%'
  )
);

create index if not exists payment_receipts_installment_idx on public.payment_receipts (installment_id) where installment_id is not null;
create index if not exists payment_receipts_staff_commission_idx on public.payment_receipts (staff_commission_id) where staff_commission_id is not null;
create index if not exists payment_receipts_payroll_idx on public.payment_receipts (payroll_id) where payroll_id is not null;
create index if not exists payment_receipts_refund_idx on public.payment_receipts (refund_id) where refund_id is not null;
create index if not exists payment_receipts_referral_idx on public.payment_receipts (referral_id) where referral_id is not null;

alter table public.payment_receipts enable row level security;

drop policy if exists "payment_receipts_select" on public.payment_receipts;
create policy "payment_receipts_select" on public.payment_receipts for select
  using (public.can_manage_payment_receipts(kind));

-- Filed under the uploader's own name, never someone else's.
drop policy if exists "payment_receipts_insert" on public.payment_receipts;
create policy "payment_receipts_insert" on public.payment_receipts for insert
  with check (public.can_manage_payment_receipts(kind) and uploaded_by = auth.uid());

-- A wrong file is removed, not rewritten.
drop policy if exists "payment_receipts_delete" on public.payment_receipts;
create policy "payment_receipts_delete" on public.payment_receipts for delete
  using (public.can_manage_payment_receipts(kind));

revoke all on public.payment_receipts from anon;
grant select, insert, delete on public.payment_receipts to authenticated;

-- ---------------------------------------------------------------- storage
--
-- payment-receipts/<kind>/<payment id>/<file>: the kind is the second folder.

drop policy if exists "documents_storage_payment_receipts" on storage.objects;
create policy "documents_storage_payment_receipts" on storage.objects for all
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'payment-receipts'
    and public.can_manage_payment_receipts((storage.foldername(name))[2])
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'payment-receipts'
    and public.can_manage_payment_receipts((storage.foldername(name))[2])
  );
