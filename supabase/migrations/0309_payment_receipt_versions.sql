-- Payment receipts: replacing one keeps the old as an earlier version, and
-- only a Super Admin deletes.
--
-- 0308 let whoever handles a payment's receipts remove one. Now:
--
--   replacing   a receipt is replaced by uploading another in its place. The
--               new one names the one it replaces (replaces), the old one
--               stops being current (is_current) and stays on file, listed as
--               an earlier version, with who replaced it and when — which is
--               the replacement's own uploader and time. A receipt is replaced
--               at most once, and only by one for the same payment.
--   deleting    a Super Admin, and only a Super Admin, deletes a receipt —
--               any receipt, current or earlier, at any time. Deleting a
--               replacement makes the receipt it replaced current again, so a
--               replacement made in error is undone by deleting it.
--
-- is_current is the triggers' alone: forced true on insert, and nobody may
-- update the table (it has no update policy or grant), so it says exactly
-- whether something has replaced the row.
--
-- Refuses to run if 0308 is not in place.

do $$
begin
  if to_regclass('public.payment_receipts') is null then
    raise exception '0309: public.payment_receipts is missing (0308)';
  end if;
  if to_regprocedure('public.is_super_admin()') is null then
    raise exception '0309: public.is_super_admin() is missing (0247)';
  end if;
end $$;

alter table public.payment_receipts
  add column if not exists replaces uuid references public.payment_receipts (id) on delete set null,
  add column if not exists is_current boolean not null default true;

-- Replaced once: a second replacement of the same receipt is refused, even
-- when two people press Replace at the same moment.
create unique index if not exists payment_receipts_replaced_once on public.payment_receipts (replaces) where replaces is not null;

-- ------------------------------------------------------------ triggers

create or replace function public.payment_receipts_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prior public.payment_receipts%rowtype;
begin
  new.is_current := true;
  if new.replaces is null then
    return new;
  end if;
  select * into prior from public.payment_receipts where id = new.replaces for update;
  if not found then
    raise exception 'The receipt being replaced is not on file any more.';
  end if;
  if prior.kind <> new.kind
     or coalesce(prior.installment_id, prior.staff_commission_id, prior.payroll_id, prior.refund_id, prior.referral_id)
        is distinct from coalesce(new.installment_id, new.staff_commission_id, new.payroll_id, new.refund_id, new.referral_id) then
    raise exception 'A receipt can only be replaced by another for the same payment.';
  end if;
  if not prior.is_current then
    raise exception 'That receipt has already been replaced.';
  end if;
  return new;
end $$;

create or replace function public.payment_receipts_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.replaces is not null then
    update public.payment_receipts set is_current = false where id = new.replaces;
  end if;
  return null;
end $$;

-- A replacement deleted: what it replaced is the current receipt again.
create or replace function public.payment_receipts_after_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.replaces is not null then
    update public.payment_receipts set is_current = true where id = old.replaces;
  end if;
  return null;
end $$;

drop trigger if exists trg_payment_receipts_before_insert on public.payment_receipts;
create trigger trg_payment_receipts_before_insert before insert on public.payment_receipts
  for each row execute function public.payment_receipts_before_insert();

drop trigger if exists trg_payment_receipts_after_insert on public.payment_receipts;
create trigger trg_payment_receipts_after_insert after insert on public.payment_receipts
  for each row execute function public.payment_receipts_after_insert();

drop trigger if exists trg_payment_receipts_after_delete on public.payment_receipts;
create trigger trg_payment_receipts_after_delete after delete on public.payment_receipts
  for each row execute function public.payment_receipts_after_delete();

-- ------------------------------------------------------------ deleting

drop policy if exists "payment_receipts_delete" on public.payment_receipts;
create policy "payment_receipts_delete" on public.payment_receipts for delete
  using (public.is_super_admin());

-- The files: read and added by whoever handles that payment's receipts, as
-- before; deleted by a Super Admin only. Split from 0308's single policy,
-- which allowed every operation to everyone it let in.
drop policy if exists "documents_storage_payment_receipts" on storage.objects;

drop policy if exists "documents_storage_payment_receipts_select" on storage.objects;
create policy "documents_storage_payment_receipts_select" on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'payment-receipts'
    and public.can_manage_payment_receipts((storage.foldername(name))[2])
  );

drop policy if exists "documents_storage_payment_receipts_insert" on storage.objects;
create policy "documents_storage_payment_receipts_insert" on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'payment-receipts'
    and public.can_manage_payment_receipts((storage.foldername(name))[2])
  );

drop policy if exists "documents_storage_payment_receipts_delete" on storage.objects;
create policy "documents_storage_payment_receipts_delete" on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'payment-receipts'
    and public.is_super_admin()
  );
