-- The Spanish embassy's own details, and a note students should not be reading.
--
-- 0199 seeded this row with "Address and hours still to be confirmed from the
-- embassy's own page" in `notes` — which is a note to ourselves, and `notes`
-- renders on the student's visa page. So every Spain student has been reading
-- our to-do list. Filled in from the embassy's own site (exteriores.gob.es).
--
-- The email is the national-visa address specifically. The embassy publishes
-- five, and a student who writes to the ambassador's office about a study visa
-- gets no reply; a page that lists all five invites exactly that.
--
-- Office hours genuinely are not published, so the note now says so. "We could
-- not find it" is useful to a counsellor; "still to be confirmed" reads as an
-- unfinished record and tells them nothing about whether looking again helps.
update public.visa_offices
set address = 'Street 6, Ramna 5, Diplomatic Enclave I, P.O. Box 1144, Islamabad',
    phone = '+92 51 208 8777',
    email = 'emb.islamabad.nac@maec.es',
    notes = 'Student visa applications are not lodged here — they go to BLS. The email above is the embassy''s national-visa address, which is the right one for a study visa; do not use the general or ambassador''s office addresses. Reception: +92 51 208 8711 / 208 8717. The embassy does not publish public counter hours.',
    verified_at = now()
where name = 'Embassy of Spain, Islamabad'
  and address is null
  and notes like '%still to be confirmed%';
