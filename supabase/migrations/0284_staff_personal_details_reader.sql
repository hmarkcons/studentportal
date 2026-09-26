-- Staff personal details, part one: the reader, and staff.manage made the
-- Super Admin's alone. Part two (0285) takes the personal columns out of what
-- a signed-in user may select; it comes after the app has been moved onto the
-- reader here, so no deployed page is left asking for a column it may no
-- longer read.
--
-- A staff member sees their own personal details and nobody else's; the
-- Super Admin sees everyone's. Staff Management (the only screen that shows
-- them) is managed by the Super Admin alone.
--
-- The staff table is readable by most staff — staff_select (0105) lets
-- Management, Processing, Finance and Counselors read every row, because
-- the portal shows colleagues' names, designations, roles and official
-- contact details everywhere work is assigned, and a student can read their
-- own counsellor's (0009). Row security cannot hide some columns of a row it
-- lets you read, so every one of those readers could also read every
-- colleague's CNIC, date of birth, address, personal phone and email and
-- emergency contact through the API, whatever the pages showed.
--
-- 1. The personal columns are taken out of what a signed-in user may select:
--    SELECT on the table is revoked and granted back column by column, less
--    these. A query that names one of them — or asks for * — now fails with
--    "permission denied", loudly, rather than quietly handing them over.
--    Writing is unchanged: staff_write (0006) is Super Admin only.
--
--    NOTE for later migrations: a new column on staff is not readable by the
--    app until it is granted here too. Grant it unless it is personal.
--
-- 2. staff_personal_details() hands the personal columns back to the two
--    people entitled to them: the staff member, for their own record, and the
--    Super Admin, for anyone's.
--
-- 3. staff.manage — adding, editing and removing staff — is the Super Admin's
--    alone. It was only theirs by default; the Role Permissions screen could
--    grant it. Its overrides are deleted and refused from now on.
--    (staff.assign_roles went in 0283.)

do $$
begin
  if to_regclass('public.staff') is null then
    raise exception '0284: public.staff is missing';
  end if;
  if to_regprocedure('public.is_super_admin()') is null then
    raise exception '0284: public.is_super_admin() is missing';
  end if;
  -- Every column this grants or withholds must exist, or the grant below
  -- would fail half-way through with a less helpful message.
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'staff'
         and column_name in ('id', 'full_name', 'role', 'roles', 'status', 'photo_path', 'designation',
                             'created_at', 'updated_at', 'mobile_official', 'email_official', 'monthly_target',
                             'work_start_time', 'work_end_time', 'work_days', 'joined_on',
                             'phone', 'whatsapp_number', 'gender', 'date_of_birth', 'marital_status', 'cnic',
                             'address', 'mobile_personal', 'email_personal', 'emergency_contact_number',
                             'emergency_contact_name', 'emergency_contact_relation')) <> 28 then
    raise exception '0284: public.staff does not have the 28 columns this migration expects';
  end if;
end $$;

-- ------------------------------------------------------ the reader
create or replace function public.staff_personal_details(p_staff uuid default null)
returns table (
  id uuid,
  gender text,
  date_of_birth date,
  marital_status text,
  cnic text,
  address text,
  mobile_personal text,
  email_personal text,
  emergency_contact_number text,
  emergency_contact_name text,
  emergency_contact_relation text
)
language sql
security definer
stable
set search_path = public
as $$
  select s.id, s.gender, s.date_of_birth, s.marital_status, s.cnic, s.address,
         s.mobile_personal, s.email_personal,
         s.emergency_contact_number, s.emergency_contact_name, s.emergency_contact_relation
  from public.staff s
  where (p_staff is null or s.id = p_staff)
    and (public.is_super_admin() or s.id = auth.uid());
$$;

comment on function public.staff_personal_details(uuid) is
  'A staff member''s personal details (CNIC, date of birth, address, personal contacts, emergency contact): their own, or anyone''s for a Super Admin. The columns themselves are not selectable (0284).';

revoke all on function public.staff_personal_details(uuid) from public, anon;
grant execute on function public.staff_personal_details(uuid) to authenticated;

-- ------------------------------------------------------ staff.manage
update public.permission_definitions set default_roles = '{super_admin}' where key = 'staff.manage';
delete from public.role_permission_overrides where permission_key = 'staff.manage';
delete from public.staff_permission_overrides where permission_key = 'staff.manage';

alter table public.role_permission_overrides drop constraint if exists role_permission_overrides_staff_manage_super_admin_only;
alter table public.role_permission_overrides
  add constraint role_permission_overrides_staff_manage_super_admin_only check (permission_key <> 'staff.manage');
alter table public.staff_permission_overrides drop constraint if exists staff_permission_overrides_staff_manage_super_admin_only;
alter table public.staff_permission_overrides
  add constraint staff_permission_overrides_staff_manage_super_admin_only check (permission_key <> 'staff.manage');

-- PostgREST reads privileges into its schema cache.
notify pgrst, 'reload schema';
