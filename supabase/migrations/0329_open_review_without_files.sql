-- Opening a document for review (Waiting on you) marks its waiting files
-- under review, and the requirement follows them (0328). A requirement with a
-- file on it but no file of its own — written the old way, before files were
-- kept one by one, by anything not yet moved over — had nothing to mark, so it
-- stayed "Submitted" while recording who had opened it. Such a requirement is
-- marked itself, as it always was.

create or replace function public.open_student_document_review(p_document_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid;
begin
  select student_id into v_student from student_documents where id = p_document_id;
  if v_student is null or not staff_can_process_student(v_student) then
    return;
  end if;
  if exists (select 1 from student_document_files where document_id = p_document_id) then
    update student_document_files set status = 'under_review' where document_id = p_document_id and status = 'submitted';
  else
    update student_documents set status = 'under_review' where id = p_document_id and status = 'submitted';
  end if;
  update student_documents
     set review_opened_by = auth.uid(), review_opened_at = now()
   where id = p_document_id and status in ('submitted', 'under_review');
end;
$$;
