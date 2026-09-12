-- Referrals: the party being paid becomes a record, not a typed-in name.
--
-- A referral is an outside sub-agent, or anyone else, who sent us a lead that
-- went on to register. The office owes that person money. What the table held
-- was `referrer_name text` — a free-text name retyped on every referral, with
-- nowhere to record a phone number, let alone the bank account the payment has
-- to go to. "Ali" and "ali " were two different people to the database and the
-- same person to everyone else, so nothing could answer the one question the
-- section exists for: what do we owe this sub-agent, across everyone they sent
-- us, and has it been paid?
--
-- So: the referring party is its own row, with the details a payment needs;
-- each referral points at one; and the money side of a referral carries a
-- currency, a date, a method and a reference, the way every other payment in
-- this system does.

-- ------------------------------------------------------- the outside party
create table if not exists public.referral_parties (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  organisation text,
  contact_number text,
  email text,
  city text,
  cnic text,
  -- Where the commission is actually sent. Nothing here is required: a party
  -- is worth recording the moment they refer someone, and the bank details
  -- usually turn up later, when the first payment is due.
  bank_name text,
  account_title text,
  account_number text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.staff (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.referral_parties is
  'Outside sub-agents and other referrers who are owed commission. Deliberately not linked to staff — a staff member''s own commission is staff_commissions.';

drop trigger if exists trg_referral_parties_updated_at on public.referral_parties;
create trigger trg_referral_parties_updated_at
  before update on public.referral_parties
  for each row execute function set_updated_at();

drop trigger if exists trg_audit_referral_parties on public.referral_parties;
create trigger trg_audit_referral_parties
  after insert or update or delete on public.referral_parties
  for each row execute function log_audit_event();

-- One party per name-and-number. Name alone would be wrong — two people are
-- genuinely called Ali — but the same name with the same phone number is one
-- person entered twice, and two rows for one person is two sets of bank
-- details and a payment sent to the wrong one.
create unique index if not exists referral_parties_identity_unique
  on public.referral_parties (lower(btrim(full_name)), coalesce(lower(btrim(contact_number)), ''));

-- --------------------------------------------------- the referral itself
alter table public.referrals
  add column if not exists referral_party_id uuid references public.referral_parties (id) on delete restrict;

-- Every existing referrer_name becomes a party, matched case- and
-- space-insensitively so the same person logged twice does not become two.
insert into public.referral_parties (full_name)
select distinct on (lower(btrim(referrer_name))) btrim(referrer_name)
from public.referrals
where btrim(coalesce(referrer_name, '')) <> ''
order by lower(btrim(referrer_name))
on conflict do nothing;

update public.referrals r
set referral_party_id = p.id
from public.referral_parties p
where r.referral_party_id is null
  and lower(btrim(r.referrer_name)) = lower(btrim(p.full_name));

-- referrer_name stays as the name recorded at the time, but the party is now
-- what the row is about. Not dropped: it is the audit trail of what was typed.
comment on column public.referrals.referrer_name is
  'The name as it was typed when the referral was logged. referral_party_id is the party actually owed the money.';

-- --------------------------------------------------------- the money side
alter table public.referrals
  add column if not exists currency text not null default 'PKR',
  add column if not exists paid_on date,
  add column if not exists payment_method text,
  add column if not exists payment_reference text,
  add column if not exists paid_by uuid references public.staff (id),
  add column if not exists notes text;

comment on column public.referrals.incentive_owed is
  'The commission owed to the referring party for this registration, typed by Finance.';

-- Existing paid rows have no date to reconcile against; the day they were last
-- touched is the closest honest answer, and the constraint below would
-- otherwise refuse to apply at all.
update public.referrals
set paid_on = (updated_at at time zone 'Asia/Karachi')::date
where incentive_status = 'paid' and paid_on is null;

-- A payment marked paid with no date is a payment nobody can reconcile, and a
-- date on an unpaid one is a contradiction. Both were possible.
alter table public.referrals drop constraint if exists referrals_paid_on_check;
alter table public.referrals
  add constraint referrals_paid_on_check
  check (
    (incentive_status = 'paid' and paid_on is not null)
    or (incentive_status <> 'paid' and paid_on is null)
  );

-- ------------------------------------------------------------ who may act
alter table public.referral_parties enable row level security;

drop policy if exists "referral_parties_select" on public.referral_parties;
create policy "referral_parties_select" on public.referral_parties
  for select using (is_active_staff());

-- The party's bank details are payment instructions. Whoever can change them
-- can redirect money, so this is the same list that may set the amount.
drop policy if exists "referral_parties_write" on public.referral_parties;
create policy "referral_parties_write" on public.referral_parties
  for all
  using (has_role(array['finance', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'super_admin']::staff_role[]));

-- Logging a referral moves from "anyone active" to the same list. 0159 opened
-- it up on the reasoning that a counselor learns who sent a student and should
-- be able to write it down; the office has since decided that a referral is a
-- payable obligation to an outside party and belongs with the people who pay
-- it. The permission below is what to widen if that changes again.
drop policy if exists "referrals_insert" on public.referrals;
create policy "referrals_insert" on public.referrals
  for insert with check (has_role(array['finance', 'super_admin']::staff_role[]));

-- Setting the amount, recording the payment and deleting a referral were
-- Finance/Management/Super Admin from 0159. The office's answer is Finance,
-- Accounts and Super Admin, and there is no separate Accounts role — Finance
-- is it. So Management comes off all four referral policies together, rather
-- than leaving it able to pay a referral it may not log.
drop policy if exists "referrals_update" on public.referrals;
create policy "referrals_update" on public.referrals
  for update
  using (has_role(array['finance', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'super_admin']::staff_role[]));

drop policy if exists "referrals_delete" on public.referrals;
create policy "referrals_delete" on public.referrals
  for delete using (has_role(array['finance', 'super_admin']::staff_role[]));

update public.permission_definitions
set default_roles = '{finance,super_admin}'
where key = 'marketing.referral_incentives';

insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
values (
  'marketing.referrals.manage',
  'Marketing',
  'Log referrals and manage referring parties',
  'Add a referring party with their contact and bank details, and log a referral against a registered student. Setting the amount and marking it paid is a separate permission.',
  '{finance,super_admin}',
  (select coalesce(max(sort_order), 0) + 10 from public.permission_definitions)
)
on conflict (key) do update
  set category = excluded.category,
      label = excluded.label,
      description = excluded.description;

-- --------------------------------------------------------------- reporting
-- What is owed to each party, across every referral they made. This is the
-- question the section could never answer, because the referrer was a string.
create or replace view public.referral_party_balances
with (security_invoker = true) as
select
  p.id as referral_party_id,
  p.full_name,
  p.organisation,
  p.contact_number,
  p.is_active,
  count(r.id) as referral_count,
  coalesce(sum(r.incentive_owed) filter (where r.incentive_status <> 'paid'), 0) as amount_owed,
  coalesce(sum(r.incentive_owed) filter (where r.incentive_status = 'paid'), 0) as amount_paid,
  max(r.paid_on) as last_paid_on
-- Deliberately no join to leads: security_invoker means a caller whose RLS
-- hides some leads would silently get smaller counts here, and a total that
-- is quietly wrong for some readers is worse than one column fewer.
from public.referral_parties p
left join public.referrals r on r.referral_party_id = p.id
group by p.id, p.full_name, p.organisation, p.contact_number, p.is_active;

comment on view public.referral_party_balances is
  'Per-party referral totals. security_invoker so the caller''s RLS on referral_parties and referrals still applies — without it the view would read as its owner and bypass both.';

grant select on public.referral_party_balances to authenticated;
