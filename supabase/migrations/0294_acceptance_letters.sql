-- Acceptance Letters: a document section for what the university sends back.
--
-- Staff file a university's letter — an acceptance, an offer, an admission or
-- invitation letter, a CAS or an I-20 — on the application it answers, from
-- the application's own page. It is kept as a student document under this
-- section, so it sits in the Documents tab beside everything else and the
-- student sees it on their own Documents page, named after the university and
-- already approved: it came from the university, there is nothing to check.
--
-- In the All-destinations checklist, straight after Admission Documents
-- (10) and before Attestation (20), because it is the answer to the
-- admission documents — every destination has it without anyone adding it.
-- Not carried into a new intake (intakeCycle.ts): last year's letter from
-- another university is not this year's admission.

do $$
begin
  if to_regclass('public.document_sections') is null or to_regclass('public.destination_document_sections') is null then
    raise exception '0294: expects the document checklist tables of 0137';
  end if;
end $$;

insert into public.document_sections (key, label, is_predefined, sort_order)
values ('acceptance_letters', 'Acceptance Letters', true, 15)
on conflict (key) do update set label = excluded.label, is_predefined = true, sort_order = excluded.sort_order;

insert into public.destination_document_sections (destination_id, section_key, sort_order)
values (null, 'acceptance_letters', 15)
on conflict do nothing;
