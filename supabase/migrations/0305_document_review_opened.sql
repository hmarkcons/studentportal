-- Who has opened a document waiting for review, and when.
--
-- The dashboard's "Waiting on you" said "3 documents to review" and sent the
-- reader to the list of every student, to find them one by one. It now names
-- each document and opens it where it is reviewed, from a page of everything
-- waiting (/waiting). Opening one from there marks it seen: it moves from
-- submitted to under_review — which the student sees as "Under review" — and
-- the list says who opened it and when, so a second officer does not pick up
-- the same document. It stays listed until it is accepted or sent back.
--
-- review_opened_by / review_opened_at hold that. A new upload — the student
-- replacing the file, which puts the row back to submitted — clears them, so a
-- fresh file is never shown as already looked at.
--
-- Safe to run again.

do $$
begin
  if to_regclass('public.student_documents') is null then
    raise exception '0305: student_documents is missing';
  end if;
end $$;

alter table public.student_documents
  add column if not exists review_opened_by uuid references public.staff (id) on delete set null,
  add column if not exists review_opened_at timestamptz;

comment on column public.student_documents.review_opened_by is
  'The staff member who last opened this document from Waiting on you while it awaited review (0305); cleared by a new upload.';
comment on column public.student_documents.review_opened_at is
  'When review_opened_by opened it (0305).';

-- A new file is a new thing to review: back to submitted, nobody has seen it.
create or replace function public.student_documents_clear_review_opened()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'submitted'
     and (old.status is distinct from 'submitted' or new.file_path is distinct from old.file_path) then
    new.review_opened_by := null;
    new.review_opened_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_student_documents_clear_review_opened on public.student_documents;
create trigger trg_student_documents_clear_review_opened
  before update on public.student_documents
  for each row execute function public.student_documents_clear_review_opened();

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'student_documents' and column_name = 'review_opened_at'
  ) then
    raise exception '0305: review_opened_at was not added';
  end if;
end $$;

notify pgrst, 'reload schema';
