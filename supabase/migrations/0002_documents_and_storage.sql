-- Case Flow — document tracker storage + auto-seeded checklists.
-- Run after 0001_init.sql: SQL Editor -> New query -> paste -> Run.

-- ---------------------------------------------------------------------------
-- Storage bucket for uploaded documents (private — access via RLS below)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Objects are stored as "<student_id>/<template_id>-<filename>"; a user may
-- read/write a file only if they can see the student it belongs to.
create policy "documents_storage_access" on storage.objects for all
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from students st
      where st.id::text = (storage.foldername(name))[1]
        and (st.assigned_counselor_id = auth.uid() or is_admin())
    )
  )
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from students st
      where st.id::text = (storage.foldername(name))[1]
        and (st.assigned_counselor_id = auth.uid() or is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- Auto-seed a student's document checklist from their destination country
-- ---------------------------------------------------------------------------

create or replace function seed_student_documents() returns trigger
language plpgsql security definer as $$
begin
  insert into student_documents (student_id, template_id, status)
  select new.id, dt.id, 'missing'
  from document_templates dt
  where dt.country = new.destination_country;
  return new;
end;
$$;

drop trigger if exists trg_seed_student_documents on students;
create trigger trg_seed_student_documents
  after insert on students
  for each row execute function seed_student_documents();
