-- A Super Admin can issue a staff member's login credentials, and read them
-- back later.
--
-- Until now a staff login was created once, with the account, and its
-- temporary password shown once on screen and never again. There was no way
-- to issue another: four of the six staff had never signed in when this was
-- written, most likely because that one-time password went nowhere.
--
-- The office asked for the Super Admin to be able to reveal a staff member's
-- password later, as staff can for a student's portal login. So a copy is
-- kept, encrypted with the same vault key as encrypted_credentials — but in a
-- table of its OWN, not as a new owner_type in that one.
--
-- That separation is the point. encrypted_credentials is read through
-- read_credential(), which authorises by staff_can_view_student(): a question
-- about students, answered generously for several roles. A staff password
-- must be readable by a Super Admin and by nobody else, and the simplest way
-- to make sure no existing function can reach it is for it to live where no
-- existing function looks. Here, RLS is on with no policies at all, so the
-- only way in is the two functions below, and both refuse anyone who is not
-- an active Super Admin.
--
-- Refuses to run if what it builds on is missing, rather than creating
-- functions that fail at first use.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'credential_encryption_key') then
    raise exception '0270: the vault key credential_encryption_key is missing (0012 creates it) — nothing to encrypt with';
  end if;
  if to_regprocedure('public.is_super_admin()') is null then
    raise exception '0270: public.is_super_admin() is missing (0247) — nothing to authorise with';
  end if;
end $$;

create table if not exists public.staff_login_credentials (
  -- One login per staff member; it goes when they do.
  staff_id uuid primary key references public.staff (id) on delete cascade,
  -- pgp_sym_encrypt of {"username": ..., "password": ...}.
  encrypted_value bytea not null,
  updated_by uuid references public.staff (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.staff_login_credentials enable row level security;
revoke all on table public.staff_login_credentials from anon, authenticated;

comment on table public.staff_login_credentials is
  'Encrypted copy of each staff member''s current login, for a Super Admin to reveal. RLS on, no policies: reached only through store_staff_login() and read_staff_login(), which require an active Super Admin.';

create or replace function public.store_staff_login(p_staff_id uuid, p_plaintext text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
begin
  if not public.is_super_admin() then
    raise exception 'Only a Super Admin can issue staff login credentials.';
  end if;
  if not exists (select 1 from public.staff where id = p_staff_id) then
    raise exception 'That staff member no longer exists.';
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'credential_encryption_key';

  insert into public.staff_login_credentials (staff_id, encrypted_value, updated_by, updated_at)
  values (p_staff_id, pgp_sym_encrypt(p_plaintext, v_key), auth.uid(), now())
  on conflict (staff_id) do update set
    encrypted_value = excluded.encrypted_value,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
end;
$$;

-- Returns no row when nothing has been stored — an account created before
-- this migration, whose password was only ever shown once.
create or replace function public.read_staff_login(p_staff_id uuid)
returns table (plaintext text, updated_at timestamptz, updated_by_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
begin
  if not public.is_super_admin() then
    raise exception 'Only a Super Admin can see staff login credentials.';
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'credential_encryption_key';

  return query
    select pgp_sym_decrypt(c.encrypted_value, v_key), c.updated_at, s.full_name
    from public.staff_login_credentials c
    left join public.staff s on s.id = c.updated_by
    where c.staff_id = p_staff_id;
end;
$$;

-- Signs a staff member out everywhere, when their password is replaced — the
-- whole reason to issue a new one is often that the old one got out, and a
-- session opened with it would otherwise outlive it. Their refresh tokens go
-- with their sessions (auth.refresh_tokens cascades from auth.sessions), and
-- the auth server refuses an access token whose session no longer exists.
create or replace function public.revoke_staff_sessions(p_staff_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'Only a Super Admin can sign a staff member out.';
  end if;
  if not exists (select 1 from public.staff where id = p_staff_id) then
    raise exception 'That staff member no longer exists.';
  end if;

  delete from auth.sessions where user_id = p_staff_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.store_staff_login(uuid, text) from public, anon;
revoke all on function public.read_staff_login(uuid) from public, anon;
revoke all on function public.revoke_staff_sessions(uuid) from public, anon;
grant execute on function public.store_staff_login(uuid, text) to authenticated;
grant execute on function public.read_staff_login(uuid) to authenticated;
grant execute on function public.revoke_staff_sessions(uuid) to authenticated;
