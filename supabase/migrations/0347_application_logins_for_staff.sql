-- The university-portal logins kept against applications, for staff, in one
-- call (0347) — for Reports → Applications & portal logins, which lists every
-- application of the students it covers with the login saved against it.
--
-- read_credential (0012) decrypts one login for one owner, so a report of 220
-- applications would make 220 calls just to learn which have one. This reads
-- them together, decrypted, as my_logins (0333) does for a student's own.
--
-- Who sees what is read_credential's rule exactly: a row comes back only for
-- a student the caller may see (staff_can_view_student — Processing and
-- Super Admin see every registered student). A student calling it gets
-- nothing (they have my_logins), and an anonymous caller cannot call it.
--
-- Read-only, and no new table, so there is nothing to audit.

do $$
begin
  if to_regprocedure('public.staff_can_view_student(uuid)') is null then
    raise exception '0347: staff_can_view_student is missing';
  end if;
  if to_regclass('public.encrypted_credentials') is null then
    raise exception '0347: encrypted_credentials is missing';
  end if;
end $$;

create or replace function public.application_logins(p_student_ids uuid[])
returns table (application_id uuid, student_id uuid, credential_type text, plaintext text, updated_at timestamptz)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'credential_encryption_key';
  return query
    select c.owner_id, a.student_id, c.credential_type, extensions.pgp_sym_decrypt(c.encrypted_value, v_key), c.updated_at
    from public.encrypted_credentials c
    join public.applications a on a.id = c.owner_id
    where c.owner_type = 'application'
      and a.student_id = any(p_student_ids)
      -- Per student, after the join: only the few applications with a login reach it.
      and public.staff_can_view_student(a.student_id);
end;
$$;

revoke all on function public.application_logins(uuid[]) from public, anon;
grant execute on function public.application_logins(uuid[]) to authenticated;
