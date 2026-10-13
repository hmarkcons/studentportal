-- my_logins() (0333) also says when each login was last changed (0334), so a
-- student whose password stops working can see whether HMARK has changed it
-- since — and the Logins page can say "Updated 12 Oct 2026" under each.
--
-- A function's result columns cannot be changed in place, so it is dropped
-- and made again, with the same body and the same grants.

do $$
begin
  if to_regprocedure('public.my_logins()') is null then
    raise exception '0334: my_logins() (0333) is missing';
  end if;
end $$;

drop function public.my_logins();

create function public.my_logins()
returns table (owner_type text, owner_id uuid, credential_type text, university text, plaintext text, updated_at timestamptz)
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
    with mine as (
      select l.id from public.leads l where l.auth_user_id = auth.uid()
    )
    select c.owner_type, c.owner_id, c.credential_type, null::text, extensions.pgp_sym_decrypt(c.encrypted_value, v_key), c.updated_at
    from public.encrypted_credentials c
    where c.owner_type = 'student' and c.owner_id in (select id from mine) and c.credential_type <> 'portal_login'
    union all
    select c.owner_type, c.owner_id, c.credential_type, u.name, extensions.pgp_sym_decrypt(c.encrypted_value, v_key), c.updated_at
    from public.encrypted_credentials c
    join public.applications a on a.id = c.owner_id
    left join public.universities u on u.id = a.university_id
    where c.owner_type = 'application' and a.student_id in (select id from mine) and c.credential_type <> 'portal_login';
end;
$$;

revoke all on function public.my_logins() from public, anon;
grant execute on function public.my_logins() to authenticated;
