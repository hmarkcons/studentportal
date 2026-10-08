-- A requirement holds several files, each reviewed on its own; and a
-- requirement deleted for a student stays deleted.
--
-- 1. student_document_files: one row per file a student, staff or a
--    university uploaded for a requirement — its name as uploaded, the names
--    of the files it was joined from (several chosen at once become one PDF),
--    and its own status: submitted, under review, approved or sent back with a
--    reason. A file uploaded later is added beside the others; a new upload
--    replaces only the files that were sent back, which go to the document's
--    history (student_document_archive) as a replaced file always has.
--
--    The requirement's own status (student_documents.status) is worked out
--    from its files, by a trigger, whatever wrote them: any sent back →
--    rejected, with their reasons; else any awaiting review → submitted;
--    else any opened for review → under_review; else all approved → verified.
--    Everything that reads the requirement — alerts (0320), stage automation,
--    queues, counts, the student's checklist — keeps reading that one status.
--    file_path stays the newest file, for whatever opens "the" file.
--
--    Written only through add_student_document_file,
--    review_student_document_file, remove_student_document_file and
--    open_student_document_review, which check who is asking:
--      staff        those who may process the student (staff_can_process_student)
--      the student  their own, never an approved requirement, and may remove
--                   only their own file until it is approved
--      a university letters on applications to it
--
-- 2. student_document_removals: a requirement staff deleted for one student
--    (a template's, or one derived from their profile). The checklist sync
--    added every such requirement back on the next page load; it now skips
--    these, and "Bring back" removes the mark.

do $$
begin
  if to_regclass('public.student_documents') is null or to_regclass('public.student_document_archive') is null then
    raise exception '0328: student_documents or its archive is missing';
  end if;
  if to_regprocedure('public.staff_can_process_student(uuid)') is null or to_regprocedure('public.is_own_student(uuid)') is null then
    raise exception '0328: the access helpers are missing';
  end if;
end $$;

-- 1 ---------------------------------------------------------------- files
create table if not exists public.student_document_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.student_documents (id) on delete cascade,
  student_id uuid not null references public.leads (id) on delete cascade,
  file_path text not null,
  file_name text not null check (length(file_name) between 1 and 255),
  source_names text[],
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'verified', 'rejected')),
  rejected_reason text,
  verified_by uuid references public.staff (id) on delete set null,
  verified_at timestamptz,
  uploaded_by_role text check (uploaded_by_role in ('student', 'staff', 'partner')),
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists student_document_files_document_idx on public.student_document_files (document_id, uploaded_at);
create index if not exists student_document_files_student_idx on public.student_document_files (student_id);

alter table public.student_document_files enable row level security;
revoke insert, update, delete on public.student_document_files from anon, authenticated;
grant select on public.student_document_files to authenticated;

-- Seen by whoever may see the requirement: its own policies decide.
drop policy if exists student_document_files_select on public.student_document_files;
create policy student_document_files_select on public.student_document_files for select
  using (exists (select 1 from public.student_documents d where d.id = student_document_files.document_id));

-- What was on file before: each requirement's one file becomes its first.
insert into public.student_document_files (
  document_id, student_id, file_path, file_name, status, rejected_reason, verified_by, verified_at, uploaded_by_role, uploaded_at
)
select
  d.id, d.student_id, d.file_path,
  left(coalesce(nullif(regexp_replace(
    regexp_replace(d.file_path, '^.*/', ''),
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-((offer_letter|rejection_letter)-)?(v[0-9]+-)?', '', 'i'
  ), ''), 'file'), 255),
  case when d.status in ('submitted', 'under_review', 'verified', 'rejected') then d.status else 'submitted' end,
  case when d.status = 'rejected' then d.rejected_reason end,
  case when d.status = 'verified' and exists (select 1 from public.staff s where s.id = d.verified_by) then d.verified_by end,
  case when d.status = 'verified' then d.verified_at end,
  d.uploaded_by_role,
  coalesce(d.uploaded_at, d.updated_at, d.created_at)
from public.student_documents d
where d.file_path is not null
  and not exists (select 1 from public.student_document_files f where f.document_id = d.id);

/** The requirement's status, newest file and verdict, from its files. */
create or replace function public.recompute_student_document(p_document_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_total int;
  v_rejected int;
  v_submitted int;
  v_review int;
  v_status text;
  v_reasons text;
  v_latest record;
  v_verified record;
begin
  select count(*),
         count(*) filter (where status = 'rejected'),
         count(*) filter (where status = 'submitted'),
         count(*) filter (where status = 'under_review')
    into v_total, v_rejected, v_submitted, v_review
  from student_document_files where document_id = p_document_id;

  if v_total = 0 then
    update student_documents
       set status = 'missing', file_path = null, rejected_reason = null, verified_at = null, verified_by = null
     where id = p_document_id and (status <> 'missing' or file_path is not null);
    return;
  end if;

  v_status := case when v_rejected > 0 then 'rejected' when v_submitted > 0 then 'submitted' when v_review > 0 then 'under_review' else 'verified' end;

  select file_path, uploaded_at, uploaded_by_role into v_latest
  from student_document_files where document_id = p_document_id
  order by uploaded_at desc, created_at desc limit 1;

  select string_agg(case when v_total > 1 then file_name || ': ' || coalesce(rejected_reason, '') else coalesce(rejected_reason, '') end, '; ' order by uploaded_at)
    into v_reasons
  from student_document_files where document_id = p_document_id and status = 'rejected';

  select verified_by, verified_at into v_verified
  from student_document_files where document_id = p_document_id and status = 'verified'
  order by verified_at desc nulls last limit 1;

  update student_documents d
     set status = v_status,
         file_path = v_latest.file_path,
         uploaded_at = v_latest.uploaded_at,
         uploaded_by_role = coalesce(v_latest.uploaded_by_role, d.uploaded_by_role),
         rejected_reason = case when v_status = 'rejected' then nullif(v_reasons, '') end,
         verified_by = case when v_status = 'verified' then v_verified.verified_by end,
         verified_at = case when v_status = 'verified' then v_verified.verified_at end
   where d.id = p_document_id
     and (d.status, d.file_path, d.uploaded_at, d.uploaded_by_role, d.rejected_reason, d.verified_by, d.verified_at)
         is distinct from
         (v_status, v_latest.file_path, v_latest.uploaded_at, coalesce(v_latest.uploaded_by_role, d.uploaded_by_role),
          case when v_status = 'rejected' then nullif(v_reasons, '') end,
          case when v_status = 'verified' then v_verified.verified_by end,
          case when v_status = 'verified' then v_verified.verified_at end);
end;
$$;

create or replace function public.student_document_files_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform recompute_student_document(coalesce(new.document_id, old.document_id));
  if tg_op = 'UPDATE' and new.document_id is distinct from old.document_id then
    perform recompute_student_document(old.document_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_student_document_files_changed on public.student_document_files;
create trigger trg_student_document_files_changed
  after insert or update or delete on public.student_document_files
  for each row execute function public.student_document_files_changed();

-- Audited, as every table people change (0322): restorable from the log.
drop trigger if exists trg_audit_student_document_files on public.student_document_files;
create trigger trg_audit_student_document_files
  after insert or update or delete on public.student_document_files
  for each row execute function public.log_audit_event('id');

/**
 * A file for a requirement. Files sent back are replaced by it — moved to the
 * document's history — and any other file stays beside it.
 */
create or replace function public.add_student_document_file(
  p_document_id uuid,
  p_path text,
  p_name text,
  p_sources text[] default null,
  p_role text default 'staff',
  p_status text default 'submitted'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_doc student_documents%rowtype;
  v_id uuid;
  v_replaced int := 0;
begin
  if p_role not in ('student', 'staff', 'partner') then
    raise exception 'Unknown uploader.';
  end if;
  if p_status not in ('submitted', 'verified') then
    raise exception 'A new file is submitted for review, or filed as approved by staff.';
  end if;

  select * into v_doc from student_documents where id = p_document_id for update;
  if v_doc.id is null then
    raise exception 'That document requirement no longer exists.';
  end if;
  if p_path is null or position(v_doc.student_id::text || '/' in p_path) <> 1 then
    raise exception 'That file is not in this student''s folder.';
  end if;

  if p_role = 'staff' then
    if not staff_can_process_student(v_doc.student_id) then
      raise exception 'not authorized';
    end if;
  elsif p_role = 'student' then
    if not is_own_student(v_doc.student_id) or p_status <> 'submitted' then
      raise exception 'not authorized';
    end if;
    if v_doc.status = 'verified' then
      raise exception 'This document has already been accepted — ask your processing officer if something needs to change.';
    end if;
  else
    if p_status <> 'submitted' or not exists (
      select 1 from applications a where a.id = v_doc.application_id and a.university_id = partner_university_id()
    ) then
      raise exception 'not authorized';
    end if;
  end if;

  -- Sent back: replaced by this upload, and kept in the history with why.
  with gone as (
    delete from student_document_files f
    where f.document_id = p_document_id and f.status = 'rejected'
    returning f.file_path, f.uploaded_at, f.uploaded_by_role, f.rejected_reason
  )
  insert into student_document_archive (document_id, file_path, version, uploaded_at, uploaded_by_role, previous_status, rejected_reason, archived_by)
  select p_document_id, g.file_path, coalesce(v_doc.version, 1), g.uploaded_at, g.uploaded_by_role, 'rejected', g.rejected_reason, auth.uid()
  from gone g;
  get diagnostics v_replaced = row_count;
  if v_replaced > 0 then
    update student_documents set version = coalesce(version, 1) + 1 where id = p_document_id;
  end if;

  insert into student_document_files (
    document_id, student_id, file_path, file_name, source_names, status, uploaded_by_role, uploaded_by, verified_by, verified_at
  )
  values (
    p_document_id, v_doc.student_id, p_path, left(coalesce(nullif(btrim(p_name), ''), 'file'), 255),
    case when cardinality(p_sources) > 1 then p_sources end,
    p_status, p_role, auth.uid(),
    case when p_status = 'verified' and exists (select 1 from staff s where s.id = auth.uid()) then auth.uid() end,
    case when p_status = 'verified' then now() end
  )
  returning id into v_id;
  return v_id;
end;
$$;

/** Approves a file, or sends it back with a reason. */
create or replace function public.review_student_document_file(p_file_id uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid;
begin
  select student_id into v_student from student_document_files where id = p_file_id;
  if v_student is null then
    raise exception 'That file is no longer on record.';
  end if;
  if not staff_can_process_student(v_student) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('verified', 'rejected') then
    raise exception 'A file is approved or sent back.';
  end if;
  if p_status = 'rejected' and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Give a reason for sending it back — the student sees it and needs to know what to fix.';
  end if;
  update student_document_files
     set status = p_status,
         rejected_reason = case when p_status = 'rejected' then btrim(p_reason) end,
         verified_by = case when exists (select 1 from staff s where s.id = auth.uid()) then auth.uid() end,
         verified_at = now()
   where id = p_file_id;
end;
$$;

/**
 * Takes one file off a requirement. Staff may take off any; the student only
 * their own, and only until it is approved. Returns its path, for the file
 * itself to be removed (kept for 90 days, src/lib/fileTrash.ts).
 */
create or replace function public.remove_student_document_file(p_file_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_file student_document_files%rowtype;
begin
  select * into v_file from student_document_files where id = p_file_id;
  if v_file.id is null then
    raise exception 'That file is no longer on record.';
  end if;
  if not (
    staff_can_process_student(v_file.student_id)
    or (is_own_student(v_file.student_id) and v_file.uploaded_by_role = 'student' and v_file.status <> 'verified')
  ) then
    raise exception 'not authorized';
  end if;
  delete from student_document_files where id = p_file_id;
  return v_file.file_path;
end;
$$;

/** Opened for review from Waiting on you: its waiting files under review, and who opened it (0305). */
create or replace function public.open_student_document_review(p_document_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid;
begin
  select student_id into v_student from student_documents where id = p_document_id;
  if v_student is null or not staff_can_process_student(v_student) then
    return;
  end if;
  update student_document_files set status = 'under_review' where document_id = p_document_id and status = 'submitted';
  update student_documents
     set review_opened_by = auth.uid(), review_opened_at = now()
   where id = p_document_id and status in ('submitted', 'under_review');
end;
$$;

-- The old one-file replacement, kept for anything still calling it: now a file added.
create or replace function public.replace_student_document(p_document_id uuid, p_new_path text, p_uploaded_by_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform add_student_document_file(
    p_document_id, p_new_path,
    regexp_replace(regexp_replace(p_new_path, '^.*/', ''), '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-((offer_letter|rejection_letter)-)?(v[0-9]+-)?', '', 'i'),
    null, p_uploaded_by_role, 'submitted'
  );
end;
$$;

revoke execute on function public.add_student_document_file(uuid, text, text, text[], text, text) from public, anon;
revoke execute on function public.review_student_document_file(uuid, text, text) from public, anon;
revoke execute on function public.remove_student_document_file(uuid) from public, anon;
revoke execute on function public.open_student_document_review(uuid) from public, anon;
revoke execute on function public.recompute_student_document(uuid) from public, anon, authenticated;
grant execute on function public.add_student_document_file(uuid, text, text, text[], text, text) to authenticated;
grant execute on function public.review_student_document_file(uuid, text, text) to authenticated;
grant execute on function public.remove_student_document_file(uuid) to authenticated;
grant execute on function public.open_student_document_review(uuid) to authenticated;

-- 2 ---------------------------------------------------------- removals
create table if not exists public.student_document_removals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.leads (id) on delete cascade,
  template_id uuid references public.document_templates (id) on delete cascade,
  derived_key text,
  name text,
  removed_by uuid,
  removed_at timestamptz not null default now(),
  check (template_id is not null or derived_key is not null)
);
create unique index if not exists student_document_removals_template on public.student_document_removals (student_id, template_id) where template_id is not null;
create unique index if not exists student_document_removals_derived on public.student_document_removals (student_id, derived_key) where derived_key is not null;

alter table public.student_document_removals enable row level security;
drop policy if exists student_document_removals_select on public.student_document_removals;
create policy student_document_removals_select on public.student_document_removals for select
  using ((select staff_can_view_student(student_id)));
drop policy if exists student_document_removals_write on public.student_document_removals;
create policy student_document_removals_write on public.student_document_removals for all
  using ((select staff_can_process_student(student_id)))
  with check ((select staff_can_process_student(student_id)));

drop trigger if exists trg_audit_student_document_removals on public.student_document_removals;
create trigger trg_audit_student_document_removals
  after insert or update or delete on public.student_document_removals
  for each row execute function public.log_audit_event('id');

-- A requirement back on the checklist, however it came back — Bring back, or
-- a restore from the audit log — is no longer marked removed.
create or replace function public.clear_student_document_removal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.application_id is null then
    delete from student_document_removals
     where student_id = new.student_id
       and ((new.template_id is not null and template_id = new.template_id)
         or (new.derived_key is not null and derived_key = new.derived_key));
  end if;
  return null;
end;
$$;

drop trigger if exists trg_clear_student_document_removal on public.student_documents;
create trigger trg_clear_student_document_removal
  after insert on public.student_documents
  for each row execute function public.clear_student_document_removal();
