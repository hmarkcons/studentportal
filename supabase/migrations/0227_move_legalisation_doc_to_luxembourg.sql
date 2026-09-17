-- Move the legalisation requirement from Australia, where it was misfiled, to
-- Luxembourg — and stop it naming the wrong country.
--
-- The template read "Legalization of all academic documents via the Austrian
-- embassy through the Belgium embassy" and sat on Australia, as a REQUIRED
-- attestation item. It has nothing to do with Australia: Australia's process is
-- ImmiAccount end to end with no legalisation of academic documents through any
-- third country's mission.
--
-- Luxembourg is where it belongs, and the "through the Belgium embassy" half is
-- what identifies it. Luxembourg has no mission in Pakistan, and Belgium
-- represents it — Luxembourg's own guidance is that long-stay applications are
-- always processed by a Luxembourg or Belgian post, and the Belgian Embassy in
-- Islamabad publishes a combined "visa for Belgium and Grand Duchy of
-- Luxembourg" page (see 0221). Austria, by contrast, has its own embassy in
-- Islamabad and needs no intermediary, so "Austrian" was the slip.
--
-- Renamed rather than moved as-is, because a template that says "Austrian"
-- while sitting on Luxembourg would relocate the confusion instead of fixing
-- it. The new name keeps what the office actually recorded — legalisation
-- through the Belgian embassy — and drops the country that does not belong.
--
-- What is NOT asserted: that Luxembourg requires this legalisation at all. The
-- Belgium-represents-Luxembourg relationship is verified; the legalisation
-- route itself is the office's own operational knowledge and was not
-- confirmed against a Luxembourg government source. The description says so,
-- so nobody later mistakes it for something we checked.
--
-- sort_order 220 puts it directly after Luxembourg's three attestation items
-- (210, 211, 212) and before the visa items, matching where Italy's apostille
-- requirement sits.

update public.document_templates t
set destination_id = (select id from public.destinations where country_code = 'LU'),
    name = 'Legalization of all academic documents through the Belgian embassy (acting for Luxembourg)',
    description = 'Luxembourg has no mission in Pakistan and Belgium handles its long-stay visa applications, so document legalisation runs through the Belgian embassy. Confirm the current route with the Belgian Embassy''s consular section before sending a student — the Belgium-for-Luxembourg representation is confirmed, but this legalisation requirement came from our own records and has not been verified against a Luxembourg government source. Moved here from Australia, where it had been misfiled and read "via the Austrian embassy".',
    sort_order = 220
where t.id = 'cc1940bc-0c70-457d-91a3-f07b8d7cf4a0'
  and t.name = 'Legalization of all academic documents via the Austrian embassy through the Belgium embassy'
  and t.destination_id = (select id from public.destinations where country_code = 'AU');

-- ------------------------------------------- the one checklist row it created
-- A single student_documents row referenced it: student "summro", registered
-- for Australia only, status "missing" with nothing uploaded. Now that the
-- template belongs to Luxembourg that row is a Luxembourg requirement on an
-- Australian student's checklist, and the documents page renders the template's
-- name against it — so it would show them a Belgian-embassy legalisation item.
--
-- Deleting it is safe and it stays deleted: ensureStudentDocumentRequirements
-- only seeds a template whose destination the student is actually registered
-- for (documents.ts — destMatches), so this one will not come back for an
-- Australia-only student. Students registered for Luxembourg will pick it up
-- automatically on their next documents page load; no backfill is needed.
--
-- Guarded on there being no uploaded file, so a row somebody has since used is
-- left alone.
delete from public.student_documents d
where d.template_id = 'cc1940bc-0c70-457d-91a3-f07b8d7cf4a0'
  and d.file_path is null
  and d.status = 'missing'
  and not exists (
    select 1
    from public.lead_destinations ld
    join public.destinations dest on dest.id = ld.destination_id
    where ld.lead_id = d.student_id
      and dest.country_code = 'LU'
  );
