-- A registered student's Gmail recovery details: the backup codes file Google
-- gives, and the recovery email and mobile number on the account (0332).
--
-- Kept apart from encrypted_credentials, which every staff member who can see
-- the student may read: these let someone take over the student's Gmail, and
-- with it every portal that sends a reset link there. Only a Super Admin and
-- the student's own processing officer (leads.processing_officer_id) add,
-- read, replace or remove them; everyone else is told only which parts are on
-- file. The student does not see them here either.
--
-- One row per student, encrypted as one JSON value with the same vault key as
-- the logins: {"email", "phone", "codes", "codes_file_name"}. The table has RLS
-- and no policies, so the functions below are the only way in. What is on file
-- is kept as plain booleans beside it, so the status can be shown without
-- decrypting anything.

create table public.student_gmail_recovery (
  student_id uuid primary key references public.leads(id) on delete cascade,
  encrypted_value bytea not null,
  has_email boolean not null default false,
  has_phone boolean not null default false,
  has_codes boolean not null default false,
  updated_by uuid references public.staff(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.student_gmail_recovery enable row level security;
revoke all on public.student_gmail_recovery from anon, authenticated;

comment on table public.student_gmail_recovery is
  'A student''s Gmail backup codes, recovery email and recovery mobile, encrypted (0332). Read and written only through the gmail_recovery functions: Super Admin and the student''s processing officer.';

-- Who may open them: a Super Admin, or the officer the student is assigned to.
-- With no officer assigned, only a Super Admin.
create or replace function public.gmail_recovery_access(p_student uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.has_role(array['super_admin']::staff_role[])
      or exists (
        select 1 from public.leads l
        join public.staff s on s.id = l.processing_officer_id
        where l.id = p_student
          and l.processing_officer_id = auth.uid()
          and s.status = 'active'
      );
$$;

-- What is on file, without the details: for anyone who can see the student.
create or replace function public.gmail_recovery_status(p_student uuid)
returns table (
  has_email boolean,
  has_phone boolean,
  has_codes boolean,
  updated_at timestamptz,
  updated_by_name text,
  can_open boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.staff_can_view_student(p_student) then
    raise exception 'not authorized';
  end if;
  return query
    select coalesce(r.has_email, false), coalesce(r.has_phone, false), coalesce(r.has_codes, false),
           r.updated_at, s.full_name, public.gmail_recovery_access(p_student)
    from (select 1) one
    left join public.student_gmail_recovery r on r.student_id = p_student
    left join public.staff s on s.id = r.updated_by;
end;
$$;

-- Replaces what is stored with exactly what is given: the server action lays
-- a blank field over what is on file before calling this. Nothing given at
-- all removes the row.
create or replace function public.store_gmail_recovery(
  p_student uuid,
  p_email text,
  p_phone text,
  p_codes text,
  p_codes_file_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_codes text := nullif(btrim(coalesce(p_codes, '')), '');
  v_key text;
begin
  if not public.gmail_recovery_access(p_student) then
    raise exception 'Only a Super Admin or this student''s processing officer can change the Gmail recovery details.';
  end if;
  if not exists (select 1 from public.leads where id = p_student) then
    raise exception 'That student no longer exists.';
  end if;

  if v_email is null and v_phone is null and v_codes is null then
    delete from public.student_gmail_recovery where student_id = p_student;
    return;
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'credential_encryption_key';
  if v_key is null then
    raise exception 'The encryption key is missing.';
  end if;

  insert into public.student_gmail_recovery as r (
    student_id, encrypted_value, has_email, has_phone, has_codes, updated_by, updated_at
  )
  values (
    p_student,
    extensions.pgp_sym_encrypt(
      jsonb_build_object(
        'email', v_email,
        'phone', v_phone,
        'codes', v_codes,
        'codes_file_name', case when v_codes is null then null else nullif(btrim(coalesce(p_codes_file_name, '')), '') end
      )::text,
      v_key
    ),
    v_email is not null, v_phone is not null, v_codes is not null, auth.uid(), now()
  )
  on conflict (student_id) do update set
    encrypted_value = excluded.encrypted_value,
    has_email = excluded.has_email,
    has_phone = excluded.has_phone,
    has_codes = excluded.has_codes,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
end;
$$;

-- The details, decrypted; null when nothing is on file.
create or replace function public.read_gmail_recovery(p_student uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_val bytea;
  v_key text;
begin
  if not public.gmail_recovery_access(p_student) then
    raise exception 'Only a Super Admin or this student''s processing officer can see the Gmail recovery details.';
  end if;
  select encrypted_value into v_val from public.student_gmail_recovery where student_id = p_student;
  if v_val is null then
    return null;
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'credential_encryption_key';
  return extensions.pgp_sym_decrypt(v_val, v_key)::jsonb;
end;
$$;

revoke all on function public.gmail_recovery_access(uuid) from public, anon;
revoke all on function public.gmail_recovery_status(uuid) from public, anon;
revoke all on function public.store_gmail_recovery(uuid, text, text, text, text) from public, anon;
revoke all on function public.read_gmail_recovery(uuid) from public, anon;
grant execute on function public.gmail_recovery_access(uuid) to authenticated;
grant execute on function public.gmail_recovery_status(uuid) to authenticated;
grant execute on function public.store_gmail_recovery(uuid, text, text, text, text) to authenticated;
grant execute on function public.read_gmail_recovery(uuid) to authenticated;

-- Secrets, like encrypted_credentials: kept out of the audit log (0322), which
-- would otherwise hold a readable history of every code.
create or replace function public.audit_excluded(p_table text) returns boolean
language sql immutable as $$
  select p_table = any (array[
    'audit_log', 'notifications', 'notification_reminders', 'login_events', 'invoice_email_log',
    'student_intake_counters', 'invoice_number_counters', 'student_code_holds',
    'staff_login_credentials', 'partner_login_credentials', 'encrypted_credentials',
    'application_interview_credentials', 'office_qr_tokens', 'scholarship_body_update_runs',
    'message_read_markers', 'support_ticket_read_markers', 'trashed_files',
    'calendar_invites', 'calendar_reminder_log', 'student_gmail_recovery'
  ])
$$;
