-- Commission adjustment/carry-forward: when a student a staff member was
-- paid commission for turns out to have no admission (or withdraws/goes
-- ghost), Finance can mark that paid commission as a credit owed by the
-- staff member, then apply it against a new commission for a different
-- student registered by the same staff. Manual, not automatic — detecting
-- "no admission" reliably across every destination's pipeline isn't
-- feasible, so Finance decides case by case (no admission, withdrawn, or
-- ghost all use the same mechanism).

create table staff_commission_credits (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff (id),
  source_commission_id uuid not null unique references staff_commissions (id) on delete cascade,
  amount numeric(12, 2) not null,
  currency text not null,
  status text not null default 'available' check (status in ('available', 'applied')),
  applied_to_commission_id uuid references staff_commissions (id),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

drop trigger if exists trg_audit_staff_commission_credits on staff_commission_credits;
create trigger trg_audit_staff_commission_credits
  after insert or update or delete on staff_commission_credits
  for each row execute function log_audit_event();

alter table staff_commission_credits enable row level security;

create policy "staff_commission_credits_select" on staff_commission_credits for select
  using (staff_id = auth.uid() or has_role(array['finance', 'super_admin']::staff_role[]));
create policy "staff_commission_credits_write" on staff_commission_credits for all
  using (has_role(array['finance', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'super_admin']::staff_role[]));
