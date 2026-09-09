-- Removes the duplicated requirements from the shared Admission list.
--
-- The list had accreted in two waves — the first nine items, then a second
-- batch that asked for several of the same documents again in different words.
-- Every student was being asked twice:
--
--   Passport copy                      +  Passport
--   Passport-size photographs          +  Photo
--   CV / Resume                        +  Updated CV (chronological order)
--   Letters of Recommendation (all)    +  Letter of Recommendation (1 of 2) and (2 of 2), masters
--
-- Checked before writing this: no row for any of the duplicates carries an
-- uploaded file, and every student holding one also holds its counterpart, so
-- nothing a student has sent in is affected and no requirement disappears from
-- anyone's checklist. The DO block below re-checks the file condition at run
-- time and refuses rather than destroying evidence if that has changed.
--
-- The wording that only existed on a discarded row is not thrown away: the
-- "chronological order" instruction moves onto CV / Resume's description,
-- where the checklist already shows it under the requirement name.
--
-- The recommendation letters are the one case that is not a straight delete.
-- A masters applicant was getting three rows for two letters. Two named slots
-- ("1 of 2", "2 of 2") are better than one vague plural row — you can see that
-- one of the two has arrived — so those are kept for masters, and the plural
-- row is narrowed to the levels that have no numbered rows of their own rather
-- than deleted. Each level therefore ends up asked for exactly what it was
-- asked for before, minus the duplication.

do $$
declare
  loser_ids uuid[];
  stuck integer;
  cv_id uuid;
  plural_lor_id uuid;
  removed integer;
begin
  -- ---------------------------------------------------------- straight pairs
  select array_agg(id) into loser_ids
  from public.document_templates
  where destination_id is null
    and category = 'admission'
    and name in ('Passport', 'Photo', 'Updated CV (chronological order)');

  if loser_ids is null then
    raise notice 'Duplicates already removed — nothing to do.';
  else
    select count(*) into stuck
    from public.student_documents
    where template_id = any (loser_ids) and file_path is not null;

    if stuck > 0 then
      raise exception 'Refusing to run: % duplicate row(s) now carry an uploaded file. Repoint or snapshot them first.', stuck;
    end if;

    -- Keep the instruction that only lived on the row being dropped.
    select id into cv_id
    from public.document_templates
    where destination_id is null and category = 'admission' and name = 'CV / Resume';

    if cv_id is not null then
      update public.document_templates
      set description = coalesce(description, 'In chronological order, and up to date.')
      where id = cv_id;
    end if;

    delete from public.student_documents where template_id = any (loser_ids);
    delete from public.document_templates where id = any (loser_ids);
    raise notice 'Removed % duplicated admission requirement(s).', array_length(loser_ids, 1);
  end if;

  -- ------------------------------------------------- recommendation letters
  select id into plural_lor_id
  from public.document_templates
  where destination_id is null
    and category = 'admission'
    and name = 'Letters of Recommendation'
    and level = 'all';

  if plural_lor_id is null then
    raise notice 'Recommendation letters already sorted out.';
  else
    -- Masters has its own two numbered rows, so drop the plural one from every
    -- masters student. Untouched rows only, as everywhere else.
    delete from public.student_documents d
    using public.leads l
    where l.id = d.student_id
      and d.template_id = plural_lor_id
      and l.level_applying_for = 'masters'
      and d.file_path is null;
    get diagnostics removed = row_count;

    -- The remaining levels keep exactly one row each. `level` holds a single
    -- value, so the one 'all' row becomes a 'bachelors' row plus a 'phd' copy.
    update public.document_templates set level = 'bachelors' where id = plural_lor_id;

    insert into public.document_templates (destination_id, category, name, description, required, level, sort_order)
    select null, 'admission', 'Letters of Recommendation', description, required, 'phd', sort_order
    from public.document_templates
    where id = plural_lor_id
      and not exists (
        select 1 from public.document_templates
        where destination_id is null and category = 'admission'
          and name = 'Letters of Recommendation' and level = 'phd'
      );

    raise notice 'Recommendation letters: cleared % duplicate row(s) from masters students.', removed;
  end if;
end $$;

-- Close the gaps the deletions left, so the builder's arrows and drag-and-drop
-- start from a clean 1..n instead of inheriting holes.
with renumbered as (
  select id, row_number() over (order by sort_order, name) * 1 as new_order
  from public.document_templates
  where destination_id is null and category = 'admission'
)
update public.document_templates t
set sort_order = r.new_order
from renumbered r
where r.id = t.id and t.sort_order <> r.new_order;
