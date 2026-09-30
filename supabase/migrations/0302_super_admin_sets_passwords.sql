-- A Super Admin sets anyone's password: a staff member's (their own
-- included), a student's or a partner university's — typed or generated. The
-- person is emailed it, signed out everywhere else, and a copy is kept for the
-- Super Admin to reveal later. Nobody else can set or reset a password.
--
-- Staff already had the copy and the sign-out (0270). Students have their copy
-- in encrypted_credentials (0012). What was missing:
--
--   * signing out someone who is not staff. revoke_staff_sessions refuses
--     anyone who is not in staff, and it would also have signed a Super Admin
--     out of the very page they set their own password on.
--     revoke_user_sessions signs out any user, and keeps the caller's own
--     current session when the user is themselves;
--   * a kept copy for a partner university's login. In a table of its own,
--     read only by a Super Admin, for the reason 0270 gives: a login must not
--     sit where a function answering a broader question can reach it.
--
-- Refuses to run if what it builds on is missing.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'credential_encryption_key') then
    raise exception '0302: the vault key credential_encryption_key is missing (0012 creates it)';
  end if;
  if to_regprocedure('public.is_super_admin()') is null then
    raise exception '0302: public.is_super_admin() is missing (0247)';
  end if;
  if to_regclass('public.partner_university_accounts') is null then
    raise exception '0302: partner_university_accounts is missing (0016)';
  end if;
end $$;

-- Signs a user out of every session but, when they are the caller, the one
-- they are using. Their refresh tokens go with the sessions, and the auth
-- server refuses an access token whose session is gone.
create or replace function public.revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_current uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only a Super Admin can sign someone out.';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'That login no longer exists.';
  end if;

  delete from auth.sessions
  where user_id = p_user_id
    and (p_user_id <> auth.uid() or v_current is null or id <> v_current);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create table if not exists public.partner_login_credentials (
  -- One login per partner account; it goes when the account does.
  partner_id uuid primary key references public.partner_university_accounts (id) on delete cascade,
  -- pgp_sym_encrypt of {"username": ..., "password": ...}.
  encrypted_value bytea not null,
  updated_by uuid references public.staff (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.partner_login_credentials enable row level security;
revoke all on table public.partner_login_credentials from anon, authenticated;

comment on table public.partner_login_credentials is
  'Encrypted copy of a partner university account''s login, for a Super Admin to reveal. RLS on, no policies: reached only through store_partner_login() and read_partner_login().';

create or replace function public.store_partner_login(p_partner_id uuid, p_plaintext text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
begin
  if not public.is_super_admin() then
    raise exception 'Only a Super Admin can set a partner university''s password.';
  end if;
  if not exists (select 1 from public.partner_university_accounts where id = p_partner_id) then
    raise exception 'That partner account no longer exists.';
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'credential_encryption_key';

  insert into public.partner_login_credentials (partner_id, encrypted_value, updated_by, updated_at)
  values (p_partner_id, pgp_sym_encrypt(p_plaintext, v_key), auth.uid(), now())
  on conflict (partner_id) do update set
    encrypted_value = excluded.encrypted_value,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
end;
$$;

-- No row when nothing is kept: a partner who chose their own password when
-- they registered, and has not had one set since.
create or replace function public.read_partner_login(p_partner_id uuid)
returns table (plaintext text, updated_at timestamptz, updated_by_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
begin
  if not public.is_super_admin() then
    raise exception 'Only a Super Admin can see a partner university''s password.';
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'credential_encryption_key';

  return query
    select pgp_sym_decrypt(c.encrypted_value, v_key), c.updated_at, s.full_name
    from public.partner_login_credentials c
    left join public.staff s on s.id = c.updated_by
    where c.partner_id = p_partner_id;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon;
revoke all on function public.store_partner_login(uuid, text) from public, anon;
revoke all on function public.read_partner_login(uuid) from public, anon;
grant execute on function public.revoke_user_sessions(uuid) to authenticated;
grant execute on function public.store_partner_login(uuid, text) to authenticated;
grant execute on function public.read_partner_login(uuid) to authenticated;
