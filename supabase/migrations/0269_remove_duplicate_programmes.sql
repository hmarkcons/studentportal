-- Remove the second copy of 43 programmes that were stored twice.
--
-- The German catalogue was imported on 2026-08-26 and again on 2026-08-27, and
-- 43 programmes at six universities (RWTH Aachen 13, Stuttgart 12, Mannheim 9,
-- Cologne 7, Freiburg 1, LMU Munich 1) came in both times: same university,
-- same name, same level. The copies differ only in how the duration and
-- language requirement are worded. The import cannot tell such a pair apart,
-- so until now it held every row for them back.
--
-- The 2026-08-26 copy is kept, as the office chose; its wording is usually the
-- fuller. Checked before writing this: no application references either copy,
-- and no 2026-08-27 copy carries an intake round, a commission rate or a field
-- that its twin lacks — so the cascades to program_intake_rounds and
-- program_commission_rates remove nothing that is not already held by the
-- copy that stays.
--
-- The ids are listed rather than derived, so this deletes exactly what was
-- reviewed and nothing a later import might have added. And it refuses to run
-- unless every listed row is still what it was when reviewed: created on
-- 2026-08-27, with a 2026-08-26 twin, and referenced by no application.

-- One DO block, so the checks and the delete are a single statement and
-- either all of it happens or none of it does.
do $$
declare
  v_ids uuid[] := array[
    '04f270e6-a9a6-4c8a-bb27-86bf0ac7264c',
    '08ebfbca-b58a-4f99-b3b8-0c9308aa935f',
    '0b4343fd-e006-404b-b2b3-735e6810a9d8',
    '0c8b3acf-9b84-4b6b-8f52-796064324b63',
    '0fba628e-8c2c-4ab3-8df9-1135b308935b',
    '142c1240-1ec9-4778-8bed-09ebd7408284',
    '1683e72e-3e89-448e-9b3f-18675882f936',
    '1ddc7c3b-4604-4c29-afdd-319f89e210b3',
    '20a03b15-451b-4ce0-92ba-e8c4fc39da7b',
    '32e65839-90e2-4af8-9f7a-fe8b2f228e24',
    '38211b34-d7b8-422c-a3f9-9cea50809ac2',
    '39778ed5-8f91-4bae-8815-0e0ca458c307',
    '3a8885bf-2fb8-4c45-8a1e-8b7cc719791b',
    '3dc5038e-ee60-4a4b-8c69-9cd8757cbf4f',
    '436ef893-30f6-41d9-a01a-e73f1524fcd3',
    '45327e48-44eb-47f4-95f2-b5508455e4bc',
    '463cec44-3f53-445e-b63b-d66f1e834a8d',
    '4787857e-b3ec-422b-a397-4767925a13cd',
    '48dd6057-19fc-4203-8e08-b3a70f3966ce',
    '4ee8dad7-5666-4a55-838a-4ed2f631ef3a',
    '6483deae-d484-458e-8bf5-890e73e80f39',
    '68598a66-31c9-407b-95ba-4e6e753bf3d6',
    '6f9c5712-e26b-4ffc-9bc5-03081ae362bc',
    '79313d9f-66f7-43a6-af98-639bb3ca656e',
    '7ba96d61-b754-4b64-8720-d308ea3d3add',
    '8046fb39-b718-464a-9232-9258ae5ff661',
    '82a50481-e033-4163-945d-1bfb9985fec1',
    '8e79383e-494c-4027-9e4f-a8405d2edff9',
    '96a7f55b-0548-43c8-a2cc-57b1376b8f4f',
    '97e87020-98f8-48b4-966f-a95795619220',
    '99d63dc4-eb67-43a1-ad02-61a7a9f00315',
    '9ae8ed38-2a96-4f7b-8cea-169dae5575c8',
    'acb09f42-0f0c-4544-8e7e-307067735a74',
    'add4cb74-9fcb-44c4-a911-73f3ab308e5b',
    'af2d0d45-5ad4-403b-8603-47c8544c3322',
    'b571b576-7cfd-444c-9c72-e293c28c0b63',
    'b8903972-c732-4f69-b025-cabcaedace9a',
    'b8a42256-2ff4-4662-81ab-eb29ac1833f9',
    'c8ebd02c-a95c-4e03-9411-92a8fd9f70ce',
    'd24c60fa-68e7-4284-9d1a-74c93c84b1de',
    'ea9ac2a8-9218-4fa7-a43e-3f534fe1af1a',
    'eb428539-3bfa-4aec-8b40-cec2c59a35ca',
    'f576b824-d763-46fa-92bc-b6c834394c32'
  ]::uuid[];
  v_present int;
  v_twinned int;
  v_applied int;
  v_deleted int;
begin
  if cardinality(v_ids) <> 43 then
    raise exception 'expected 43 listed ids, found %', cardinality(v_ids);
  end if;

  select count(*) into v_present
  from public.programs p
  where p.id = any (v_ids) and p.created_at::date = date '2026-08-27';
  if v_present <> 43 then
    raise exception 'only % of the 43 listed programmes still exist as 2026-08-27 rows', v_present;
  end if;

  select count(*) into v_twinned
  from public.programs p
  where p.id = any (v_ids)
    and exists (
      select 1 from public.programs k
      where k.id <> p.id
        and k.university_id = p.university_id
        and k.level = p.level
        and lower(regexp_replace(btrim(k.name), '\s+', ' ', 'g'))
          = lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g'))
        and k.created_at::date = date '2026-08-26'
    );
  if v_twinned <> 43 then
    raise exception 'only % of the 43 still have the 2026-08-26 copy they duplicate', v_twinned;
  end if;

  select count(*) into v_applied from public.applications a where a.program_id = any (v_ids);
  if v_applied > 0 then
    raise exception '% applications now reference a copy to be deleted — move them to the kept copy first', v_applied;
  end if;

  delete from public.programs p where p.id = any (v_ids);
  get diagnostics v_deleted = row_count;
  if v_deleted <> 43 then
    raise exception 'deleted % rows, expected 43', v_deleted;
  end if;

  raise notice 'removed % duplicate programmes', v_deleted;
end $$;
