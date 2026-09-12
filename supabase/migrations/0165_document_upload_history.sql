-- A rejected document stays on the record instead of being destroyed by the
-- replacement.
--
-- Replacing a document overwrote it, twice over. studentUploadDocument writes
-- to `<student>/<document id>-<filename>` with upsert: true, so a student who
-- fixes their passport scan and uploads it under the same filename replaces
-- the object in storage — the rejected one is gone, not merely unlinked. And
-- the row's file_path is overwritten regardless of filename, so even when the
-- old object survives, nothing points at it and no screen can reach it.
--
-- That is the opposite of what a rejection is for. Staff sent something back
-- for a reason, and the thing they saw is the evidence of why.

create table if not exists student_document_archive (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references student_documents (id) on delete cascade,
  -- The storage object is deliberately NOT deleted; this keeps the pointer,
  -- as agreement_submission_archive does for a rejected agreement (0122).
  file_path text not null,
  version int not null,
  uploaded_at timestamptz,
  uploaded_by_role text,
  -- What it was superseded from: 'rejected' with the reason staff gave, or
  -- 'submitted' when it was replaced before anybody had reviewed it.
  previous_status text not null,
  rejected_reason text,
  archived_at timestamptz not null default now(),
  archived_by uuid
);

create index if not exists student_document_archive_document_idx
  on student_document_archive (document_id, archived_at desc);

alter table student_document_archive enable row level security;

-- Whoever can see the requirement can see what was sent against it: the staff
-- who handle that student, the student themself, and the university for an
-- application at their own institution.
drop policy if exists "student_document_archive_select" on student_document_archive;
create policy "student_document_archive_select" on student_document_archive
  for select using (
    exists (
      select 1
      from student_documents d
      left join applications a on a.id = d.application_id
      where d.id = student_document_archive.document_id
        and (
          staff_can_view_student(d.student_id)
          or is_own_student(d.student_id)
          or (a.id is not null and a.university_id = partner_university_id())
        )
    )
  );

-- No insert or update policy: the function below is the only writer, so a
-- superseded document cannot be edited into saying something else, and nobody
-- can plant a version that was never uploaded.

-- ---------------------------------------------------------------------------
-- Replacing an upload
-- ---------------------------------------------------------------------------
-- Security definer so the archive row and the replacement land together. A
-- half-applied replacement would either lose the record of what was sent or
-- leave the requirement pointing at a file the uploader has already moved on
-- from.
--
-- The caller has already written the new object to storage under a path that
-- includes the version, so the two files coexist.
create or replace function replace_student_document(
  p_document_id uuid,
  p_new_path text,
  p_uploaded_by_role text
) returns void
language plpgsql
security definer
as $$
declare
  v_doc student_documents%rowtype;
begin
  if p_uploaded_by_role not in ('student', 'staff', 'partner') then
    raise exception 'Unknown uploader.';
  end if;

  select * into v_doc from student_documents where id = p_document_id for update;
  if v_doc.id is null then
    raise exception 'That document requirement no longer exists.';
  end if;

  -- Only the people the requirement belongs to.
  if not (
    staff_can_view_student(v_doc.student_id)
    or is_own_student(v_doc.student_id)
    or exists (
      select 1 from applications a
      where a.id = v_doc.application_id and a.university_id = partner_university_id()
    )
  ) then
    raise exception 'not authorized';
  end if;

  if v_doc.status = 'verified' then
    raise exception 'This document has already been accepted and cannot be replaced — ask staff to reopen it first.';
  end if;

  -- Whatever was there goes to the archive, with the reason it was sent back
  -- if there was one. Nothing is deleted from storage.
  if v_doc.file_path is not null then
    insert into student_document_archive (
      document_id, file_path, version, uploaded_at, uploaded_by_role,
      previous_status, rejected_reason, archived_by
    )
    values (
      v_doc.id, v_doc.file_path, coalesce(v_doc.version, 1), v_doc.uploaded_at, v_doc.uploaded_by_role,
      v_doc.status, v_doc.rejected_reason, auth.uid()
    );
  end if;

  update student_documents
     set file_path = p_new_path,
         status = 'submitted',
         uploaded_at = now(),
         uploaded_by_role = p_uploaded_by_role,
         version = coalesce(version, 1) + case when v_doc.file_path is null then 0 else 1 end,
         -- The new upload has not been reviewed, so the previous verdict must
         -- not linger against it.
         rejected_reason = null,
         verified_at = null,
         verified_by = null
   where id = p_document_id;
end;
$$;

grant execute on function replace_student_document(uuid, text, text) to authenticated;
