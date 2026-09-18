-- An employee can hold more than one role.
--
-- staff.role was a single staff_role, and real staffing is not: the same
-- person counsels students and handles the finance, or covers processing
-- alongside marketing. With one slot they had to be given the role whose
-- access mattered most and then worked around for the rest.
--
-- HOW THIS REACHES EVERY POLICY WITHOUT EDITING THEM. Row-level security does
-- not read staff.role directly — it asks has_role(array[...]) and
-- is_super_admin(), 206 times across 66 migrations. Both are redefined here to
-- look at the set, so every one of those policies honours multiple roles from
-- this migration onward. Editing 206 call sites would have been the same
-- change made 206 chances to get wrong.
--
-- role IS KEPT, as the primary role. 44 places in the application still read
-- it, it is what the staff list shows, and a person's main job is a real thing
-- worth recording. A trigger keeps the two in step in both directions so
-- neither can drift, and role is always one of roles.

alter table public.staff add column if not exists roles staff_role[] not null default '{}';

comment on column public.staff.roles is
  'Every role this employee holds. The authority for access: has_role() and is_super_admin() read this. staff.role is the primary one and is always a member of this set.';
comment on column public.staff.role is
  'The employee''s primary role — what the staff list shows and what the application''s own checks default to. Always present in staff.roles; kept in step by the staff_sync_roles trigger.';

-- Everyone already on file keeps exactly the access they have.
update public.staff set roles = array[role] where coalesce(array_length(roles, 1), 0) = 0;

-- ------------------------------------------------------------- keeping step
create or replace function public.staff_sync_roles()
returns trigger
language plpgsql
as $$
begin
  -- Written the old way: only role was set. Treat it as the whole set, so any
  -- code path still unaware of roles keeps working correctly rather than
  -- creating somebody with no access.
  if coalesce(array_length(new.roles, 1), 0) = 0 then
    new.roles := array[new.role];
    return new;
  end if;

  -- De-duplicated and ordered by the enum, so the stored set has one shape and
  -- the primary is predictable rather than an artefact of click order.
  select array_agg(r order by r)
    into new.roles
    from (select distinct unnest(new.roles) as r) d;

  -- The primary has to be one of them. Preserved when it still is, so an edit
  -- that merely adds a second role does not silently change somebody's main
  -- job; otherwise the first of the set.
  if new.role is null or not (new.role = any(new.roles)) then
    new.role := new.roles[1];
  end if;

  return new;
end $$;

drop trigger if exists staff_sync_roles on public.staff;
create trigger staff_sync_roles
  before insert or update of role, roles on public.staff
  for each row execute function public.staff_sync_roles();

-- Now that the trigger guarantees it, an employee cannot end up with none.
-- Somebody who should have no access is marked inactive, which is what that
-- column is for; an active employee with no role is a half-state that reads
-- as a mistake either way.
alter table public.staff drop constraint if exists staff_has_a_role;
alter table public.staff
  add constraint staff_has_a_role check (coalesce(array_length(roles, 1), 0) >= 1);

-- --------------------------------------------------- what access now means
-- Both still read `role` as well as `roles`. The trigger makes that
-- redundant, and it is kept deliberately: if any row were ever written by a
-- path that bypasses the trigger, this fails open to the access the person
-- already had rather than locking them out of their own system.
-- The parameter keeps its original name. CREATE OR REPLACE cannot rename an
-- input parameter, and 206 policies depend on this function so it cannot be
-- dropped and recreated — the column is therefore qualified as staff.roles
-- and the parameter referred to as $1, which leaves no ambiguity between the
-- two things now called "roles".
create or replace function public.has_role(roles staff_role[])
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.staff
    where staff.id = auth.uid()
      and staff.status = 'active'
      and (staff.roles && $1 or staff.role = any($1))
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.staff
    where id = auth.uid()
      and status = 'active'
      and ('super_admin' = any(staff.roles) or staff.role = 'super_admin')
  );
$$;

-- An index, because has_role() is now an array overlap and runs on virtually
-- every policy evaluation.
create index if not exists staff_roles_idx on public.staff using gin (roles);

-- ------------------------------------------- assigning roles without payroll
--
-- Management is to set people's roles, but the staff row also carries
-- monthly_salary, allowance, commission rates and bonus — so granting the
-- existing staff.manage would hand Management everybody's pay along with it.
-- A narrower permission instead.
insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
values (
  'staff.assign_roles',
  'Admin',
  'Assign staff roles',
  'Change which roles an employee holds, without access to salary, allowances or commission rates. Granting the Super Admin role itself is always restricted to Super Admin.',
  array['super_admin', 'management']::staff_role[],
  55
)
on conflict (key) do update
  set category = excluded.category,
      label = excluded.label,
      description = excluded.description,
      default_roles = excluded.default_roles,
      sort_order = excluded.sort_order;
