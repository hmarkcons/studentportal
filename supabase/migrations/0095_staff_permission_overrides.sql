-- Per-staff-member permission overrides, layered on top of the per-role
-- overrides from 0094: Super Admin can now grant/revoke a "major
-- functionality" permission for one specific staff member, without
-- affecting anyone else who shares that role. Precedence, most specific
-- wins: staff override > role override > coded-in default_roles.

create table staff_permission_overrides (
  staff_id uuid not null references staff (id) on delete cascade,
  permission_key text not null references permission_definitions (key) on delete cascade,
  allowed boolean not null,
  updated_by uuid references staff (id),
  updated_at timestamptz not null default now(),
  primary key (staff_id, permission_key)
);

alter table staff_permission_overrides enable row level security;

create policy "staff_permission_overrides_select" on staff_permission_overrides for select
  using (is_active_staff());
create policy "staff_permission_overrides_write" on staff_permission_overrides for all
  using (is_super_admin()) with check (is_super_admin());

create or replace function staff_has_permission(p_key text) returns boolean
language sql security definer stable as $$
  select case
    when has_role(array['super_admin']::staff_role[]) then true
    else coalesce(
      (select allowed from staff_permission_overrides where staff_id = auth.uid() and permission_key = p_key),
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
