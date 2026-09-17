-- Remove the five remaining test agreement templates.
--
-- These sit on real destinations and were left alone by 0229 because only
-- three had been authorised at the time:
--
--   "halla bol"          Austria      signatory "yajood majood"
--   "bark"               Canada       signatory "halla"
--   "neh neh"            France       signatory "horse"
--   "Prod Confirm Test"  Ireland      signatory "Test Signatory"
--   "Meow"               Romania      signatory "Billa"
--
-- All five confirmed unreferenced before deletion: the only foreign key into
-- agreement_templates is agreements.template_id, and none of them had an
-- agreement against it. Nothing cascades and nothing blocks.
--
-- Four of them carried an uploaded file — all four the same
-- "HMARK Student Contract - Netherlands - Copy.docx", re-uploaded per
-- destination. Those objects were removed from the documents bucket before
-- this ran, since the paths only exist on the rows being deleted. "Prod
-- Confirm Test" had no file.
--
-- One consequence worth stating plainly: "Meow" is Romania's last remaining
-- agreement template, so Romania is left with none. That is the right outcome
-- rather than a reason to keep a template called "Meow" — but it means Romania
-- needs a real Standard template before an agreement can be generated for a
-- Romanian student. Sweden, Hungary, New Zealand and Spain are already in that
-- position. Austria, Canada, France and Ireland each keep their "Standard".
--
-- Guarded on the id, the name and the absence of any agreement, so a template
-- that has since been used cannot be caught by a re-run.
delete from public.agreement_templates t
where t.id in (
    '692d75d2-391b-45f4-9373-4d13a88cdff8',  -- "halla bol"         (Austria)
    'cbc8480e-2f1a-4900-9fbe-55bd40e90dfe',  -- "bark"              (Canada)
    'a71c100f-5b12-40c4-a77f-cbcd3fe25fc8',  -- "neh neh"           (France)
    '273c574b-62bc-4fe9-b7bc-2d78864f380c',  -- "Prod Confirm Test" (Ireland)
    '6d340dd9-b9e8-4576-a9e3-55de247fef78'   -- "Meow"              (Romania)
  )
  and t.name in ('halla bol', 'bark', 'neh neh', 'Prod Confirm Test', 'Meow')
  and not exists (select 1 from public.agreements a where a.template_id = t.id);
