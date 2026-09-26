-- Only a Super Admin gives a staff member their roles — one or several — and
-- nobody changes their own or anyone else's.
--
-- 0247 made role assignment a permission, staff.assign_roles (Super Admin and
-- Management by default), and 0248's set_staff_roles() checked that
-- permission. On production the Role Permissions screen had since granted it
-- to Counselor, Processing and Digital Marketing — five of the six staff. Any
-- of them could open Staff Management, read every colleague's personal
-- details, and give anyone, themselves included, any role short of Super
-- Admin: Finance, and with it every salary.
--
-- So the permission goes. set_staff_roles() now asks whether the caller is a
-- Super Admin and nothing else, and staff.assign_roles is deleted — its
-- overrides go with it (they cascade) — so no screen can hand it out again.
-- The staff table itself was already Super Admin only to write
-- ("staff_write", 0006), so the function was the only other way in.

do $$
begin
  if to_regprocedure('public.set_staff_roles(uuid, staff_role[])') is null then
    raise exception '0283: public.set_staff_roles(uuid, staff_role[]) is missing (0248)';
  end if;
  if to_regprocedure('public.is_super_admin()') is null then
    raise exception '0283: public.is_super_admin() is missing';
  end if;
end $$;

create or replace function public.set_staff_roles(p_staff uuid, p_roles staff_role[])
returns staff_role[] language plpgsql security definer set search_path = public as $$
declare
  v_wanted staff_role[];
  v_primary staff_role;
begin
  if not is_super_admin() then
    raise exception 'Only a Super Admin can change staff roles.' using errcode = '42501';
  end if;

  -- Sorted and deduplicated. `order by r` on an enum orders by DECLARATION
  -- order, not alphabetically, and staff_role is declared most-senior first —
  -- so roles[1] is the senior role, which is what the primary falls back to.
  select array_agg(distinct r order by r) into v_wanted
  from unnest(coalesce(p_roles, '{}'::staff_role[])) r
  where r is not null;
  v_wanted := coalesce(v_wanted, '{}'::staff_role[]);

  if coalesce(array_length(v_wanted, 1), 0) = 0 then
    raise exception 'Pick at least one role. To stop someone signing in, set their status to Suspended instead.'
      using errcode = '23514';
  end if;

  select s.role into v_primary from staff s where s.id = p_staff;
  if v_primary is null then
    raise exception 'That staff member no longer exists.' using errcode = 'P0002';
  end if;

  -- The primary role is the one shown wherever a single role is named. Keep
  -- the one they already had while it is still held, so adding a second role
  -- doesn't rename somebody everywhere; otherwise fall back to the senior one.
  if not (v_primary = any(v_wanted)) then
    v_primary := v_wanted[1];
  end if;

  update staff set roles = v_wanted, role = v_primary where id = p_staff;

  return v_wanted;
end $$;

revoke all on function public.set_staff_roles(uuid, staff_role[]) from public;
grant execute on function public.set_staff_roles(uuid, staff_role[]) to authenticated;

delete from public.permission_definitions where key = 'staff.assign_roles';
