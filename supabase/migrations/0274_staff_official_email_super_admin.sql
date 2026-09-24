-- Only a Super Admin may change a staff member's official email.
--
-- The official email is the address they sign in with: changing it on Staff
-- Management moves their login to the new address (updateStaffDetails in
-- src/lib/actions/admin.ts). The app refuses the change from anyone else, and
-- greys the field out for them; this is the lock underneath, so a request
-- made around the app — straight to the API with someone's session — cannot
-- rewrite the column either.
--
-- Today staff_write (0006) already lets only a Super Admin update a staff row
-- at all. This keeps the official email theirs alone if that policy is ever
-- widened — to let Management edit contact details, say — since RLS cannot
-- single out a column and this can.
--
-- A write with no signed-in user (the service role, the SQL editor) is let
-- through: that is the server itself, or someone at the database.

create or replace function public.guard_staff_official_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_official is distinct from old.email_official
     and auth.uid() is not null
     and not public.is_super_admin() then
    raise exception 'Only a Super Admin can change a staff member''s official email.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_staff_official_email_guard on public.staff;
create trigger trg_staff_official_email_guard
  before update of email_official on public.staff
  for each row execute function public.guard_staff_official_email();
