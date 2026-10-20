-- Referral parties' bank details and CNIC, split off to finance (M2 from the
-- 2026-10-21 security review).
--
-- referral_parties.account_number / account_title / bank_name / cnic sat on a
-- table whose SELECT policy is is_active_staff(), while the Referrals page is
-- open to marketing and digital_marketing as well as finance (0273:
-- page.marketing.referrals). So every active staff member could read a
-- sub-agent's bank account number and CNIC — the page even shows a "Paid into"
-- column and ships the columns to the browser via select('*') — even though
-- only finance / Super Admin (marketing.referrals.manage) can enter or edit
-- them. Confirmed: a counselor session's SELECT on referral_parties is allowed
-- (the table is simply empty today, so nothing has leaked yet).
--
-- The office's own pattern for "sensitive sub-data readable by fewer people" is
-- a child table with its own RLS — staff pay (staff_compensation, 0249), a
-- counsellor's note (lead_remark_current, 0307), Gmail recovery (0332). This is
-- the same: the payee's names, amounts owed and referral history stay readable
-- by whoever manages referrals; only the bank details and CNIC move behind
-- finance.
--
-- Expand step: create the child table and copy any existing values across.
-- 0342 drops the old columns once the app reads/writes the new home.

create table if not exists public.referral_party_bank (
  referral_party_id uuid primary key references public.referral_parties (id) on delete cascade,
  cnic text,
  bank_name text,
  account_title text,
  account_number text,
  updated_at timestamptz not null default now()
);

-- Carry across anything already on file (none today, but correct regardless).
insert into public.referral_party_bank (referral_party_id, cnic, bank_name, account_title, account_number)
select id, cnic, bank_name, account_title, account_number
  from public.referral_parties
 where cnic is not null or bank_name is not null or account_title is not null or account_number is not null
on conflict (referral_party_id) do nothing;

alter table public.referral_party_bank enable row level security;
revoke all on public.referral_party_bank from anon;

-- Finance and Super Admin only — the same people who may add/edit a referring
-- party (marketing.referrals.manage) and record its payments.
drop policy if exists referral_party_bank_rw on public.referral_party_bank;
create policy referral_party_bank_rw on public.referral_party_bank
  for all to authenticated
  using ((select public.has_role(array['finance', 'super_admin']::staff_role[])))
  with check ((select public.has_role(array['finance', 'super_admin']::staff_role[])));

-- Audited like the table it came from (0322), keyed by its primary key. The
-- audit log itself is Super-Admin-read only, so the account numbers it carries
-- are no more exposed than they were as part of referral_parties.
drop trigger if exists trg_audit_referral_party_bank on public.referral_party_bank;
create trigger trg_audit_referral_party_bank
  after insert or update or delete on public.referral_party_bank
  for each row execute function public.log_audit_event('referral_party_id');
