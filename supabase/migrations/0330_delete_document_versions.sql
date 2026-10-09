-- Staff delete an earlier version of a student's document — one replaced, or
-- one sent back — from its history, at any time.
--
-- student_document_archive has had a select policy only (0165): what was
-- replaced stayed for good. remove_student_document_version takes one off,
-- for whoever may process the student (as removing a current file,
-- remove_student_document_file, 0328), and returns its path for the file
-- itself to be removed — kept for 90 days (src/lib/fileTrash.ts) unless the
-- requirement still uses it. The deletion is in the audit log (0322), and can
-- be restored from there.

create or replace function public.remove_student_document_version(p_archive_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_path text;
  v_student uuid;
begin
  select a.file_path, d.student_id into v_path, v_student
  from student_document_archive a join student_documents d on d.id = a.document_id
  where a.id = p_archive_id;
  if v_student is null then
    raise exception 'That earlier version is no longer on record.';
  end if;
  if not staff_can_process_student(v_student) then
    raise exception 'not authorized';
  end if;
  delete from student_document_archive where id = p_archive_id;
  -- The path only when nothing else still points at that file.
  if exists (select 1 from student_document_files where file_path = v_path)
     or exists (select 1 from student_documents where file_path = v_path)
     or exists (select 1 from student_document_archive where file_path = v_path) then
    return null;
  end if;
  return v_path;
end;
$$;

revoke execute on function public.remove_student_document_version(uuid) from public, anon;
grant execute on function public.remove_student_document_version(uuid) to authenticated;
