-- "Visa application form" existed on the shared list AND on eleven
-- destinations' own lists, under exactly the same name and in the same
-- section — so every student pursuing one of those destinations was asked for
-- it twice.
--
-- The shared row already reaches every student, which is why it is the one
-- kept; the eleven copies add nothing but a second row to chase. Austria,
-- Finland, Hungary, Ireland, Luxembourg and Romania had a copy that had never
-- been seeded to anybody at all.
--
-- Same conditions as the admission dedup in 0142: no copy has a file uploaded
-- against it, and the shared row is already on every affected student, so no
-- student loses a requirement and no evidence is touched. Re-checked at run
-- time rather than trusted.

do $$
declare
  shared_id uuid;
  copy_ids uuid[];
  stuck integer;
begin
  select id into shared_id
  from public.document_templates
  where destination_id is null and category = 'visa' and lower(btrim(name)) = 'visa application form';

  if shared_id is null then
    raise notice 'No shared "Visa application form" row — leaving the per-destination copies alone.';
    return;
  end if;

  select array_agg(id) into copy_ids
  from public.document_templates
  where destination_id is not null
    and category = 'visa'
    and lower(btrim(name)) = 'visa application form';

  if copy_ids is null then
    raise notice 'Already deduplicated.';
    return;
  end if;

  select count(*) into stuck
  from public.student_documents
  where template_id = any (copy_ids) and file_path is not null;

  if stuck > 0 then
    raise exception 'Refusing to run: % per-destination copy row(s) now carry an uploaded file.', stuck;
  end if;

  -- Nobody should be left without the requirement: every student holding a
  -- copy must already hold the shared row.
  select count(*) into stuck
  from public.student_documents d
  where d.template_id = any (copy_ids)
    and not exists (
      select 1 from public.student_documents s
      where s.student_id = d.student_id and s.template_id = shared_id
    );

  if stuck > 0 then
    -- Point those rows at the shared template instead of deleting them, so the
    -- requirement survives even though the duplicate does not.
    update public.student_documents
    set template_id = shared_id
    where id in (
      select d.id from public.student_documents d
      where d.template_id = any (copy_ids)
        and not exists (
          select 1 from public.student_documents s
          where s.student_id = d.student_id and s.template_id = shared_id
        )
    );
    raise notice 'Repointed % row(s) to the shared requirement.', stuck;
  end if;

  delete from public.student_documents where template_id = any (copy_ids);
  delete from public.document_templates where id = any (copy_ids);
  raise notice 'Removed % duplicated "Visa application form" copies.', array_length(copy_ids, 1);
end $$;
