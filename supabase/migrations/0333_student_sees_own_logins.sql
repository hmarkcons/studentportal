-- A registered student sees the logins the office keeps for them, and only
-- sees them (0333).
--
-- 1. my_logins(): every login kept for the signed-in student — their own
--    (Gmail, the university and visa portals, the scholarship portals, any
--    other) and each one kept against one of their applications, with that
--    application's university — decrypted, in one call. Their portal pages
--    show them as they are, with no Reveal. This portal's own login
--    (portal_login) is not among them: they are signed in with it. The Gmail
--    recovery details (0332) are a separate table and never reach a student.
--
-- 2. A student no longer changes or deletes a saved login. store_credential
--    (0178) and delete_credential (0103) let a student write their own; the
--    office keeps these, so a student's copy is now read-only. The portal's
--    Visa and Scholarship pages, the only places that offered an edit, no
--    longer do.

do $$
begin
  if to_regprocedure('public.store_credential(text, uuid, text, text)') is null
     or to_regprocedure('public.delete_credential(text, uuid, text)') is null
     or to_regprocedure('public.resolve_credential_student_id(text, uuid)') is null then
    raise exception '0333: the credential functions this replaces are missing';
  end if;
end $$;

-- 1 -------------------------------------------------------------- my_logins
create or replace function public.my_logins()
returns table (owner_type text, owner_id uuid, credential_type text, university text, plaintext text)
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
    select c.owner_type, c.owner_id, c.credential_type, null::text, extensions.pgp_sym_decrypt(c.encrypted_value, v_key)
    from public.encrypted_credentials c
    where c.owner_type = 'student' and c.owner_id in (select id from mine) and c.credential_type <> 'portal_login'
    union all
    select c.owner_type, c.owner_id, c.credential_type, u.name, extensions.pgp_sym_decrypt(c.encrypted_value, v_key)
    from public.encrypted_credentials c
    join public.applications a on a.id = c.owner_id
    left join public.universities u on u.id = a.university_id
    where c.owner_type = 'application' and a.student_id in (select id from mine) and c.credential_type <> 'portal_login';
end;
$$;

revoke all on function public.my_logins() from public, anon;
grant execute on function public.my_logins() to authenticated;

-- 2 ------------------------------------------------------ staff write them
create or replace function store_credential(
  p_owner_type text, p_owner_id uuid, p_credential_type text, p_plaintext text
) returns void
language plpgsql security definer as $$
declare
  v_student_id uuid;
  v_key text;
begin
  v_student_id := resolve_credential_student_id(p_owner_type, p_owner_id);

  if not staff_can_view_student(v_student_id) then
    if is_own_student(v_student_id) then
      raise exception 'Your logins are kept by HMARK — if one has changed, message your counsellor.';
    end if;
    raise exception 'not authorized';
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'credential_encryption_key';

  insert into encrypted_credentials (
    owner_type, owner_id, credential_type, encrypted_value, updated_by, updated_by_role
  )
  values (p_owner_type, p_owner_id, p_credential_type, pgp_sym_encrypt(p_plaintext, v_key), auth.uid(), 'staff')
  on conflict (owner_type, owner_id, credential_type)
  do update set
    encrypted_value = excluded.encrypted_value,
    updated_at = now(),
    updated_by = excluded.updated_by,
    updated_by_role = excluded.updated_by_role;
end;
$$;

create or replace function delete_credential(p_owner_type text, p_owner_id uuid, p_credential_type text) returns void
language plpgsql security definer as $$
declare
  v_student_id uuid;
begin
  v_student_id := resolve_credential_student_id(p_owner_type, p_owner_id);
  if not staff_can_view_student(v_student_id) then
    raise exception 'not authorized';
  end if;

  delete from encrypted_credentials where owner_type = p_owner_type and owner_id = p_owner_id and credential_type = p_credential_type;
end;
$$;

-- Used only when staff delete a student (src/lib/actions/leads.ts).
create or replace function delete_owned_credentials(p_owner_type text, p_owner_id uuid) returns void
language plpgsql security definer as $$
declare
  v_student_id uuid;
begin
  v_student_id := resolve_credential_student_id(p_owner_type, p_owner_id);
  if not staff_can_view_student(v_student_id) then
    raise exception 'not authorized';
  end if;

  delete from encrypted_credentials where owner_type = p_owner_type and owner_id = p_owner_id;
end;
$$;
