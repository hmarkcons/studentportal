-- Staff personal details, part two: the personal columns are no longer
-- selectable by a signed-in user (see 0284 for the whole story). Applied once
-- the app reads them through staff_personal_details() instead.
--
-- NOTE for later migrations: a new column on staff is not readable by the app
-- until it is granted here too. Grant it unless it is personal.

do $$
begin
  if to_regclass('public.staff') is null then
    raise exception '0285: public.staff is missing';
  end if;
  if to_regprocedure('public.is_super_admin()') is null then
    raise exception '0285: public.is_super_admin() is missing';
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
    raise exception '0285: public.staff does not have the 28 columns this migration expects';
  end if;
end $$;

-- ------------------------------------------------------ the columns
revoke select on public.staff from anon, authenticated;

grant select (
  id, full_name, role, roles, status, photo_path, designation,
  created_at, updated_at,
  mobile_official, email_official,
  monthly_target, work_start_time, work_end_time, work_days, joined_on
) on public.staff to authenticated;

-- Withheld: phone, whatsapp_number (unused, and personal if anything),
-- gender, date_of_birth, marital_status, cnic, address, mobile_personal,
-- email_personal, emergency_contact_number, emergency_contact_name,
-- emergency_contact_relation.

-- PostgREST reads privileges into its schema cache.
notify pgrst, 'reload schema';
