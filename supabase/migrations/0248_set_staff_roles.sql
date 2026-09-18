-- Management can now assign roles (0247 added the staff.assign_roles
-- permission), but the staff table's own write policy is Super Admin only:
--
--   create policy "staff_write" on staff for all
--     using (is_super_admin()) with check (is_super_admin());
--
-- and RLS cannot restrict WHICH COLUMNS a writer may touch. So a policy wide
-- enough to let Management set roles would also hand them every salary and
-- commission rate on the same table — exactly what "roles only" rules out.
--
-- Hence a function instead: it writes the two role columns and nothing else,
-- so the column boundary is enforced where it can't be worked around, rather
-- than resting on the server action happening to build a narrow update.

-- ---------------------------------------------------------------------------
-- staff_has_permission(), brought in line with the app
-- ---------------------------------------------------------------------------
-- Two divergences from src/lib/auth/permissions.ts, both of which would
-- matter the moment this function actually gates something:
--
--   1. It read `s.role` — the primary role alone. Somebody who is Counselor
--      primarily and Management second would have been refused a permission
--      their Management role grants them. This is the same bug class 0247
--      fixed in has_role().
--   2. A role-level override for ONE of several held roles resolved by
--      coalesce, i.e. first-found-wins, where the app OR's every role's answer
--      together. Most-permissive-wins is the deliberate choice there: roles
--      are additive, so adding one must never take access away.
--
-- The precedence order is otherwise unchanged and still matches the app: a
-- staff-level override wins outright, then each role resolves to its own
-- override or the key's defaults, and those are OR'd.
create or replace function public.staff_has_permission(p_key text) returns boolean
language sql security definer stable set search_path = public as $$
  with me as (
    select s.id,
           case
             when coalesce(array_length(s.roles, 1), 0) > 0 then s.roles
             else array[s.role]
           end as roles
    from staff s
    where s.id = auth.uid() and s.status = 'active'
  )
  select case
    when (select 'super_admin' = any(roles) from me) then true
    else coalesce(
      -- Set for this one person, and wins outright.
      (select allowed from staff_permission_overrides
        where staff_id = (select id from me) and permission_key = p_key),
      -- Otherwise every held role gets its own answer, and any allow wins.
      (
        select bool_or(
          coalesce(
            (select o.allowed from role_permission_overrides o
              where o.role = r and o.permission_key = p_key),
            (select r = any(pd.default_roles) from permission_definitions pd where pd.key = p_key),
            false
          )
        )
        from unnest((select roles from me)) r
      ),
      false
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- set_staff_roles()
-- ---------------------------------------------------------------------------
-- Every rule that must hold whoever is calling and however they reach it.
-- The staff form checks the same things first so it can show a sentence
-- instead of an exception, but these are the checks that actually bind.
create or replace function public.set_staff_roles(p_staff uuid, p_roles staff_role[])
returns staff_role[] language plpgsql security definer set search_path = public as $$
declare
  v_wanted staff_role[];
  v_previous staff_role[];
  v_primary staff_role;
begin
  if not staff_has_permission('staff.assign_roles') then
    raise exception 'You do not have permission to change staff roles.' using errcode = '42501';
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

  select coalesce(s.roles, '{}'::staff_role[]), s.role
    into v_previous, v_primary
  from staff s where s.id = p_staff;
  if v_primary is null then
    raise exception 'That staff member no longer exists.' using errcode = 'P0002';
  end if;

  -- Super Admin is granted and removed by Super Admins only. Anyone who can
  -- hand it out can hand it to themselves, and with it the permissions editor
  -- and every salary in the company. Removal is restricted for the mirror
  -- reason: it is how one admin would lock another out.
  if ('super_admin' = any(v_wanted))
     is distinct from ('super_admin' = any(v_previous) or v_primary = 'super_admin') then
    if not is_super_admin() then
      raise exception 'Only a Super Admin can grant or remove the Super Admin role.' using errcode = '42501';
    end if;
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
