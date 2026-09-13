-- A student can change their own portal password.
--
-- store_credential has always authorised is_own_student — the original note
-- says the student provides these credentials — but it then stamped
-- updated_by with auth.uid(), and that column is a foreign key to staff. A
-- student's id is not in staff, so every student write died on the constraint
-- rather than on the permission. The function said yes and the table said no.
--
-- Found while wiring the visa login into the student portal: the read worked,
-- the write failed with a foreign key error nobody would connect to
-- permissions.

-- Who last touched it, when it was not a member of staff. updated_by stays a
-- real reference for staff edits; for a student there is only one person it
-- could be — the owner — so the role is the whole answer.
alter table public.encrypted_credentials
  add column if not exists updated_by_role text not null default 'staff';

alter table public.encrypted_credentials drop constraint if exists encrypted_credentials_updated_by_role_check;
alter table public.encrypted_credentials
  add constraint encrypted_credentials_updated_by_role_check
  check (updated_by_role in ('staff', 'student'));

comment on column public.encrypted_credentials.updated_by_role is
  'Who last wrote this. updated_by is null for a student edit, because that column references staff and the owner is the only student it could be.';

create or replace function store_credential(
  p_owner_type text, p_owner_id uuid, p_credential_type text, p_plaintext text
) returns void
language plpgsql security definer as $$
declare
  v_student_id uuid;
  v_key text;
  v_is_staff boolean;
begin
  v_student_id := resolve_credential_student_id(p_owner_type, p_owner_id);
  v_is_staff := staff_can_view_student(v_student_id);

  if not (v_is_staff or is_own_student(v_student_id)) then
    raise exception 'not authorized';
  end if;

  -- portal_login is this system's own password for the student, written when
  -- staff grant or reset portal access so they can pass it on. A student
  -- overwriting the stored copy would not change the password they sign in
  -- with — it would only make the copy staff read a lie.
  if not v_is_staff and p_credential_type = 'portal_login' then
    raise exception 'A student cannot change their portal login here — ask staff to reset it.';
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'credential_encryption_key';

  insert into encrypted_credentials (
    owner_type, owner_id, credential_type, encrypted_value, updated_by, updated_by_role
  )
  values (
    p_owner_type, p_owner_id, p_credential_type, pgp_sym_encrypt(p_plaintext, v_key),
    -- Null rather than the student's id: the column references staff, and
    -- inventing a row there to satisfy it would be worse than recording none.
    case when v_is_staff then auth.uid() else null end,
    case when v_is_staff then 'staff' else 'student' end
  )
  on conflict (owner_type, owner_id, credential_type)
  do update set
    encrypted_value = excluded.encrypted_value,
    updated_at = now(),
    updated_by = excluded.updated_by,
    updated_by_role = excluded.updated_by_role;
end;
$$;

grant execute on function store_credential(text, uuid, text, text) to authenticated;
