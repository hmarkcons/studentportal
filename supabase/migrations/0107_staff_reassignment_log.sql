-- Tracks each student handed from a deactivated staff member to their
-- chosen replacement (see updateStaffDetails in src/lib/actions/admin.ts),
-- so reactivating the original staff member later can automatically hand
-- those same students back — but only the ones nobody has since reassigned
-- again (checked at reversal time against the student's CURRENT
-- assigned_counselor_id, not recorded here).
create table staff_reassignment_log (
  id uuid primary key default gen_random_uuid(),
  from_staff_id uuid not null references staff (id) on delete cascade,
  to_staff_id uuid not null references staff (id) on delete cascade,
  student_id uuid not null references leads (id) on delete cascade,
  reassigned_at timestamptz not null default now(),
  reversed_at timestamptz
);

alter table staff_reassignment_log enable row level security;
create policy "staff_reassignment_log_all" on staff_reassignment_log for all
  using (is_super_admin()) with check (is_super_admin());
