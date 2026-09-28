-- A student may see their processing officer's card as well as their
-- counsellor's.
--
-- The student dashboard shows both people who look after them. 0009 let a
-- student read the staff row of their assigned counsellor alone, so the
-- processing officer came back as nothing — no error, just an empty card
-- saying one would be assigned, for a student who had one.
--
-- Only those two rows, and only the columns 0285 grants a signed-in user at
-- all (name, designation, the official number and email, working hours); the
-- personal ones stay withheld whatever this policy says.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'processing_officer_id'
  ) then
    raise exception '0289: leads.processing_officer_id is missing';
  end if;
end $$;

drop policy if exists "staff_select_for_own_student" on public.staff;
create policy "staff_select_for_own_student" on public.staff for select
  using (exists (
    select 1 from public.leads l
    where l.auth_user_id = auth.uid()
      and (l.assigned_counselor_id = staff.id or l.processing_officer_id = staff.id)
  ));

notify pgrst, 'reload schema';
