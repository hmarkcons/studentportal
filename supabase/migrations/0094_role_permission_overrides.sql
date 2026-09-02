-- Role permission overrides: lets Super Admin grant or revoke a curated set
-- of "major functionality" permissions per role, on top of the app's normal
-- coded-in defaults. App-layer only (server actions + nav visibility) — does
-- NOT touch any existing RLS policy, which stays the authoritative security
-- boundary it already is for every table. An override here can only affect
-- behavior gated by staff_has_permission()/the app's permission checks; it
-- cannot widen access past what a table's own RLS policy already allows.

create table permission_definitions (
  key text primary key,
  category text not null,
  label text not null,
  description text not null,
  default_roles staff_role[] not null,
  sort_order int not null default 0
);

create table role_permission_overrides (
  role staff_role not null,
  permission_key text not null references permission_definitions (key) on delete cascade,
  allowed boolean not null,
  updated_by uuid references staff (id),
  updated_at timestamptz not null default now(),
  primary key (role, permission_key)
);

-- Single source of truth for "does the current user have permission X",
-- usable from the app (via rpc) and, if ever needed later, from RLS/RPC
-- functions too. Super Admin always passes, and can't be revoked.
create or replace function staff_has_permission(p_key text) returns boolean
language sql security definer stable as $$
  select case
    when has_role(array['super_admin']::staff_role[]) then true
    else coalesce(
      (
        select o.allowed
        from role_permission_overrides o
        join staff s on s.id = auth.uid()
        where o.role = s.role and o.permission_key = p_key
      ),
      (
        select s.role = any(pd.default_roles)
        from staff s, permission_definitions pd
        where s.id = auth.uid() and pd.key = p_key
      ),
      false
    )
  end;
$$;

alter table permission_definitions enable row level security;
alter table role_permission_overrides enable row level security;

-- Permission rules aren't sensitive data (no student/financial info) — any
-- active staff member can read the full catalogue/override set (needed so
-- each role's own effective permissions and the nav can be computed
-- app-side); only Super Admin can change overrides.
create policy "permission_definitions_select" on permission_definitions for select
  using (is_active_staff());
create policy "role_permission_overrides_select" on role_permission_overrides for select
  using (is_active_staff());
create policy "role_permission_overrides_write" on role_permission_overrides for all
  using (is_super_admin()) with check (is_super_admin());

-- ---------------------------------------------------------------------------
-- Seed: one row per "major functionality", default_roles matching exactly
-- the role checks already hard-coded in the app today (see the action files
-- under src/lib/actions/) — so installing this migration changes nothing
-- until Super Admin actually overrides something.
-- ---------------------------------------------------------------------------
insert into permission_definitions (key, category, label, description, default_roles, sort_order) values
  ('staff.manage', 'Staff & HR', 'Manage staff accounts', 'Create, edit, and deactivate staff logins.', array['super_admin']::staff_role[], 10),
  ('partners.approve', 'Staff & HR', 'Approve partner accounts', 'Approve or reject partner-university self-registrations.', array['super_admin']::staff_role[], 20),
  ('attendance.qr_admin', 'Staff & HR', 'Office QR check-in code', 'View and rotate the office attendance QR code.', array['super_admin']::staff_role[], 30),

  ('finance.commissions.manage', 'Finance', 'Manage commissions & payroll', 'Add/edit/delete staff commissions, add/edit partner commissions, mark them paid, upload payment proof, and manage payroll.', array['finance', 'super_admin']::staff_role[], 40),
  ('finance.partner_commissions.delete', 'Finance', 'Delete partner commission records', 'Delete a partner (university) commission record.', array['super_admin']::staff_role[], 50),
  ('finance.invoices.manage', 'Finance', 'Manage invoices', 'Edit invoices and their installment plans.', array['finance', 'super_admin']::staff_role[], 60),
  ('finance.invoices.delete', 'Finance', 'Delete invoices', 'Delete an invoice entirely.', array['super_admin']::staff_role[], 70),
  ('finance.refunds.manage', 'Finance', 'Create & delete refund records', 'Add a manual refund record or delete one.', array['super_admin']::staff_role[], 80),
  ('finance.refunds.review', 'Finance', 'Review refund status & eligibility', 'Update a refund''s status or eligibility.', array['finance', 'management', 'super_admin']::staff_role[], 90),

  ('leads.delete', 'Students & Agreements', 'Delete leads', 'Permanently delete a lead record.', array['super_admin', 'processing']::staff_role[], 100),
  ('agreements.process', 'Students & Agreements', 'Process agreements', 'Regenerate an agreement PDF and upload the signed copy.', array['super_admin', 'processing']::staff_role[], 110),
  ('agreements.edit_delete', 'Students & Agreements', 'Edit or delete agreements', 'Correct or remove a generated (unsigned) agreement.', array['super_admin']::staff_role[], 120),

  ('scholarships.manage', 'Reference Data & Setup', 'Edit/delete scholarship records', 'Edit or delete scholarship bodies and student scholarship records.', array['super_admin']::staff_role[], 130),
  ('document_trackers.manage', 'Reference Data & Setup', 'Manage document tracker fields', 'Add, edit, or delete per-country document tracker field definitions.', array['super_admin']::staff_role[], 140),
  ('inventory.manage', 'Reference Data & Setup', 'Manage inventory items', 'Add, edit, or delete inventory catalog items.', array['management', 'super_admin']::staff_role[], 150);
