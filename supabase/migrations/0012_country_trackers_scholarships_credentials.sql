-- HMARK CRM rebuild — step 8: per-country Documentation Trackers (Modules
-- 1N-1T), Italy scholarship data, and encrypted portal-credential storage
-- shared by every tracker/visa/scholarship section that needs it.
-- Run after 0011_applications_documents.sql.

create extension if not exists supabase_vault cascade;

-- ---------------------------------------------------------------------------
-- Country-specific tracker fields (Skype ID, VPD status, Fiscal Code, EeF
-- track, etc.) — one generic key/value table rather than a dedicated table
-- per country, since the doc says this pattern "will be replicated" as more
-- countries are added (see plan decision #4). Visible only to the
-- Documentation/Processing Officer role, per the doc.
-- ---------------------------------------------------------------------------

create table application_country_extra (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  field_key text not null,
  field_value text,
  updated_by uuid references staff (id),
  updated_at timestamptz not null default now(),
  unique (application_id, field_key)
);

-- ---------------------------------------------------------------------------
-- Encrypted portal credentials (VFS/appointment, Universitaly pre-enrollment,
-- CIMEA, scholarship portal, university portal — every "stored securely"
-- field in the doc). Access is only through the two functions below; the
-- base table itself has RLS enabled with no policies, so direct queries from
-- `authenticated`/`anon` return nothing.
-- ---------------------------------------------------------------------------

create table encrypted_credentials (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('student', 'application')),
  owner_id uuid not null,
  credential_type text not null,
  encrypted_value bytea not null,
  updated_by uuid references staff (id),
  updated_at timestamptz not null default now(),
  unique (owner_type, owner_id, credential_type)
);

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'credential_encryption_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'credential_encryption_key',
      'Symmetric key for encrypted_credentials (store_credential/read_credential)'
    );
  end if;
end;
$$;

create or replace function resolve_credential_student_id(p_owner_type text, p_owner_id uuid) returns uuid
language sql stable as $$
  select case p_owner_type
    when 'student' then p_owner_id
    when 'application' then (select student_id from applications where id = p_owner_id)
  end;
$$;

-- Students can submit their own portal credentials (per the doc: "Student
-- provides their appointment portal login credentials ... so staff can
-- manage/track appointments on their behalf"); staff who can see the
-- student can also store/update them.
create or replace function store_credential(
  p_owner_type text, p_owner_id uuid, p_credential_type text, p_plaintext text
) returns void
language plpgsql security definer as $$
declare
  v_student_id uuid;
  v_key text;
begin
  v_student_id := resolve_credential_student_id(p_owner_type, p_owner_id);
  if not (staff_can_view_student(v_student_id) or is_own_student(v_student_id)) then
    raise exception 'not authorized';
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'credential_encryption_key';

  insert into encrypted_credentials (owner_type, owner_id, credential_type, encrypted_value, updated_by)
  values (p_owner_type, p_owner_id, p_credential_type, pgp_sym_encrypt(p_plaintext, v_key), auth.uid())
  on conflict (owner_type, owner_id, credential_type)
  do update set encrypted_value = excluded.encrypted_value, updated_at = now(), updated_by = auth.uid();
end;
$$;

create or replace function read_credential(
  p_owner_type text, p_owner_id uuid, p_credential_type text
) returns text
language plpgsql security definer as $$
declare
  v_student_id uuid;
  v_key text;
  v_val bytea;
begin
  v_student_id := resolve_credential_student_id(p_owner_type, p_owner_id);
  if not (staff_can_view_student(v_student_id) or is_own_student(v_student_id)) then
    raise exception 'not authorized';
  end if;

  select encrypted_value into v_val from encrypted_credentials
    where owner_type = p_owner_type and owner_id = p_owner_id and credential_type = p_credential_type;
  if v_val is null then
    return null;
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'credential_encryption_key';
  return pgp_sym_decrypt(v_val, v_key);
end;
$$;

grant execute on function store_credential(text, uuid, text, text) to authenticated;
grant execute on function read_credential(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Scholarships — Italy public universities only (Modules 1N + Scholarship
-- Region & University Directory)
-- ---------------------------------------------------------------------------

create table scholarship_bodies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text,
  covers text[] not null default '{}', -- university names this body serves
  academic_year text not null,
  application_deadline text,
  document_upload_deadline text,
  courier_deadline text,
  isee_threshold text,
  ispe_threshold text,
  stipend_amount text,
  benefits text,
  last_updated_year int,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_scholarship_bodies_updated_at on scholarship_bodies;
create trigger trg_scholarship_bodies_updated_at
  before update on scholarship_bodies
  for each row execute function set_updated_at();

create table student_scholarships (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references leads (id) on delete cascade,
  application_id uuid references applications (id),
  scholarship_body_id uuid references scholarship_bodies (id),
  name text,
  provider text,
  award_amount numeric(12, 2),
  application_deadline date,
  status text not null default 'applied' check (status in ('applied', 'awarded', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_student_scholarships_updated_at on student_scholarships;
create trigger trg_student_scholarships_updated_at
  before update on student_scholarships
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table application_country_extra enable row level security;
alter table encrypted_credentials enable row level security; -- intentionally no policies; use store_credential/read_credential
alter table scholarship_bodies enable row level security;
alter table student_scholarships enable row level security;

create policy "application_country_extra_select" on application_country_extra for select
  using (has_role(array['processing', 'super_admin']::staff_role[]));
create policy "application_country_extra_write" on application_country_extra for all
  using (has_role(array['processing', 'super_admin']::staff_role[]))
  with check (has_role(array['processing', 'super_admin']::staff_role[]));

create policy "scholarship_bodies_select" on scholarship_bodies for select using (is_active_staff());
create policy "scholarship_bodies_write" on scholarship_bodies for all
  using (has_role(array['processing', 'super_admin']::staff_role[]))
  with check (has_role(array['processing', 'super_admin']::staff_role[]));

-- Student-facing visibility rule: a student sees scholarship data only for
-- the one application they've finalized pre-enrollment on; staff with
-- processing access see all of a student's applications regardless.
create policy "student_scholarships_select" on student_scholarships for select
  using (
    has_role(array['processing', 'super_admin']::staff_role[])
    or (
      is_own_student(student_id)
      and exists (
        select 1 from applications a
        where a.id = student_scholarships.application_id and a.preenrollment_finalized
      )
    )
  );
create policy "student_scholarships_write" on student_scholarships for all
  using (has_role(array['processing', 'super_admin']::staff_role[]))
  with check (has_role(array['processing', 'super_admin']::staff_role[]));
