-- When a payment proof was uploaded.
--
-- The last upload path in the app that recorded nothing. A university uploads
-- proof that it paid a commission, and Finance uploads proof that it paid a
-- staff member — both land in payment_proof_path with no date attached, so
-- neither side could say when the money was evidenced. On the partner page it
-- was worse than undated: nothing on the row changed after the upload, so a
-- university had no way to tell whether it had gone through, and re-uploading
-- was the only way to be sure.
--
-- Both tables have an updated_at, but it moves whenever anything on the row
-- changes — a status flip, a rate correction — so it cannot answer when the
-- proof itself arrived.

alter table public.partner_commissions add column if not exists payment_proof_uploaded_at timestamptz;
alter table public.staff_commissions add column if not exists payment_proof_uploaded_at timestamptz;

comment on column public.partner_commissions.payment_proof_uploaded_at is
  'When the payment proof now on file was uploaded.';
comment on column public.staff_commissions.payment_proof_uploaded_at is
  'When the payment proof now on file was uploaded.';

-- Existing proofs get the row's last-changed time, as the agreements in 0154
-- did: an upper bound rather than the real moment, and better than a null that
-- reads as "no proof was ever uploaded" beside a file that plainly exists.
update public.partner_commissions
   set payment_proof_uploaded_at = coalesce(updated_at, created_at)
 where payment_proof_path is not null and payment_proof_uploaded_at is null;
update public.staff_commissions
   set payment_proof_uploaded_at = coalesce(updated_at, created_at)
 where payment_proof_path is not null and payment_proof_uploaded_at is null;

-- Structural, like the student_documents trigger in 0154, rather than four
-- call sites each remembering: two in finance.ts, one in partner.ts, one in
-- admin.ts.
create or replace function set_commission_proof_uploaded_at() returns trigger
language plpgsql as $$
begin
  if new.payment_proof_path is not null
     and (tg_op = 'INSERT' or new.payment_proof_path is distinct from old.payment_proof_path)
     and new.payment_proof_uploaded_at is null then
    new.payment_proof_uploaded_at := now();
  end if;
  -- A proof that is cleared should not leave its date behind claiming one is
  -- on file.
  if new.payment_proof_path is null then
    new.payment_proof_uploaded_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_partner_commissions_proof_uploaded_at on public.partner_commissions;
create trigger trg_partner_commissions_proof_uploaded_at
  before insert or update on public.partner_commissions
  for each row execute function set_commission_proof_uploaded_at();

drop trigger if exists trg_staff_commissions_proof_uploaded_at on public.staff_commissions;
create trigger trg_staff_commissions_proof_uploaded_at
  before insert or update on public.staff_commissions
  for each row execute function set_commission_proof_uploaded_at();
