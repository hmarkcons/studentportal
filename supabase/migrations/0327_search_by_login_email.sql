-- Finding a student by the email they sign in to the portal with.
--
-- The leads and registered students lists search the email on the record
-- (leads.email). A student's portal login is a separate address, in
-- auth.users, which nothing a signed-in user can read: when the two differ —
-- a student registered with one address and signs in with another — searching
-- the one they write from found nobody.
--
-- staff_search_login_email returns the students whose sign-in address
-- contains the words, only where it differs from the record's (the record's
-- is searched already), and only those the caller may see.

create or replace function public.staff_search_login_email(p_term text)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select l.id
  from public.leads l
  join auth.users u on u.id = l.auth_user_id
  where (select public.is_active_staff())
    and length(btrim(coalesce(p_term, ''))) >= 2
    and u.email ilike '%' || btrim(p_term) || '%'
    and lower(u.email) <> lower(coalesce(l.email, ''))
    and public.staff_can_view_student(l.id)
  limit 100
$$;

revoke execute on function public.staff_search_login_email(text) from public, anon;
grant execute on function public.staff_search_login_email(text) to authenticated;
