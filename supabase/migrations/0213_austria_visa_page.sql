-- Austria's visa page, and a correction to where students are being sent.
--
-- Austria does not work like the other destinations. A degree student is not
-- applying for a visa at all: for a stay over six months the application is
-- for a Residence Permit - Student, lodged at the Austrian mission, decided in
-- Vienna, and collected as a card after arrival. A "visa" only comes into it
-- for stays of six months or less.
--
-- The important correction is where it is lodged. 0199 recorded VFS Global as
-- the place applications go, because the Embassy's page does send applicants
-- there — but only for Schengen visas. The Embassy's own words are:
--
--   "Appointments for applying for a national visa (Category D) must be
--    scheduled via email directly with the consulate of the embassy."
--
--   "Appointment Booking: VFS Global" — under Schengen Visa (Category C).
--
-- A student sent to VFS for a study application is in the wrong place. So VFS
-- is no longer marked as taking applications and the Embassy is, which also
-- makes the summary line on the page say the right thing.
--
-- Figures from OeAD, Austria's own agency for education and
-- internationalisation, as at 2026. They are indexed annually, so the page
-- says to check them.

-- ------------------------------------------------------------- the offices
-- VFS handles Schengen C here, not student applications. Left active and
-- visible, because a student who has been told "Austria uses VFS" needs to
-- read why that does not apply to them, rather than find the entry gone.
update public.visa_offices
set submits_applications = false,
    notes = 'Handles Schengen visitor visas (Category C) for Austria only. Student and other national (Category D) applications are NOT lodged here — those appointments are arranged by email with the Embassy''s consulate. Do not book here for a study application.',
    internal_notes = 'Centre cities and addresses are not published in one list and VFS blocks automated requests. Relevant only for Category C; the Embassy''s own page routes national visas to the consulate by email.',
    verified_at = now()
where name = 'VFS Global — Austria'
  and internal_notes = 'Centre cities and addresses not yet confirmed on VFS.';

update public.visa_offices
set submits_applications = true,
    notes = 'Student residence permit and national (Category D) applications are lodged here. The appointment is arranged by email with the consulate — not through VFS, and not by telephone. Consular enquiries are answered in writing only; consular telephone hours are Mon-Thu 16:00-17:00. Consular email: islamabad-ka@bmeia.gv.at',
    verified_at = now()
where name = 'Austrian Embassy Islamabad'
  and submits_applications = false;

-- ------------------------------------------------------------- the sections
insert into public.visa_page_sections
  (destination_id, title, body, link_label, link_url, audience, sort_order)
select d.id, s.title, s.body, s.link_label, s.link_url, s.audience, s.sort_order
from public.destinations d
cross join (values

  (10, 'both', 'A residence permit, not a visa',
   $$Austria is different from the other destinations, and the difference matters from the first day.

For a degree course — anything longer than six months — you are not applying for a student visa. You are applying for a Residence Permit - Student. The application is lodged at the Austrian Embassy in Islamabad, decided by the authorities in Austria, and the permit itself is a card you collect after you arrive.

A visa only comes into it for shorter stays: a Visa C covers up to 90 days, a Visa D from 91 days to six months. Neither is what a degree student needs.

You cannot apply for this from inside Austria, and a visa cannot be converted or extended there. It is done here, before you travel.$$,
   'OeAD: residence permit for students', 'https://oead.at/en/to-austria/entry-and-residence/residence-permit-student-no-mobility-programme'),

  (20, 'both', 'Where you apply, and where you do not',
   $$This one is worth reading twice, because Austria is often described wrongly.

Your application goes to the Austrian Embassy in Islamabad. The appointment is arranged by email with the Embassy's consulate — islamabad-ka@bmeia.gv.at. Not by telephone, and not through a visa centre.

VFS Global does run Austrian visa appointments in Pakistan, but only for Schengen visitor visas (Category C). A student application is a national matter and is not lodged there. If you have been told to book with VFS for your studies, that advice is about the wrong category.

The consulate answers enquiries in writing. Consular telephone hours are Monday to Thursday, 16:00 to 17:00.$$,
   null, null),

  (30, 'both', 'Getting the study place first',
   $$The application needs proof that an Austrian university has admitted you — the Studienplatznachweis. Without it there is nothing to lodge.

Austrian universities assess a foreign qualification against what the same subject would require in Austria. Where yours does not line up, they can admit you conditionally and require supplementary examinations — the Ergaenzungspruefung — usually in specific subjects or in German.

If that applies to you it changes your timeline, sometimes by a semester, so find out early whether your admission is conditional on one. Your tracker records both the Studienplatznachweis and whether an Ergaenzungspruefung is required.$$,
   null, null),

  (40, 'both', 'Attestation of your documents',
   $$Academic documents need the Pakistani attestation chain before Austria will look at them:

1. IBCC for school and intermediate documents; HEC for degrees and transcripts.
2. Then the Ministry of Foreign Affairs.

Ask the Embassy at the point of your appointment whether any further legalisation or authentication is needed on top of that — the requirement differs between document types, and it is better to hear it from them than to assume.

Start this before you have the admission letter. It is the slowest part of the file and it does not depend on the university.$$,
   null, null),

  (50, 'both', 'The money rule',
   $$Austria sets the figure by age, and the two amounts are very different.

- Under 24: EUR 722.58 a month
- 24 and over: EUR 1,308.39 a month

You have to prove twelve months in advance, not the length of a semester. That is about EUR 8,671 if you are under 24, and about EUR 15,700 if you are 24 or over. Check which side of the line you fall on — a birthday between now and the application can change the amount.

Two additions people miss:

- If your accommodation costs more than EUR 386.43 a month, you must show extra funds to cover the difference.
- You must also show funds for health insurance, separately.

The money has to sit in a savings book or bank account in your own name that can be accessed from Austria. Alternatives Austria accepts are a formal declaration of liability (Haftungserklaerung) from someone resident in the EU, or confirmation of a scholarship.

These amounts are indexed each year. Confirm the current figures before anyone moves money.$$,
   null, null),

  (60, 'both', 'What the application needs',
   $$- Valid passport, and a recent photograph
- Proof of admission to the Austrian university (Studienplatznachweis)
- Proof of the means of subsistence set out above
- Proof of accommodation in Austria
- Confirmation of health insurance covering all risks in Austria
- Police clearance certificate — required for a first application
- Attested academic documents
- Birth certificate, and civil documents where relevant

Take originals. Where a document is not in English or German, a certified translation goes with it.$$,
   null, null),

  (70, 'both', 'The fee, and how long it takes',
   $$One application fee of EUR 218.

The decision period is 90 days. If the authorities come back asking for further documents, that period is extended by another 90 days — so a file that needs anything chasing can run to six months.

That is the single strongest argument for starting early. There is no fast track, and the clock restarts on questions rather than pausing.$$,
   null, null),

  (80, 'both', 'After you arrive',
   $$Two things, in this order, and the first has a three-day clock on it.

Register your address. Within three working days of moving in, register at the Meldeamt for the place you are living. That produces the Meldezettel. If you are in a hotel or similar short-term accommodation you are exempt for up to two months, but that exemption runs out quickly.

Collect the permit card. You collect it from the residence authority in Austria, and you need two things with you: the Meldezettel, and confirmation of your final admission at the university. So the registration is not merely bureaucracy — the card is not issued without it.$$,
   null, null),

  (90, 'staff', 'Note for the counsellor',
   $$Five things specific to Austria:

1. VFS is the wrong place for our students. The Embassy's own page routes Schengen (Category C) appointments to VFS and national (Category D) appointments to the consulate by email. Our office record said VFS took the applications; that has been corrected. Anyone who has been telling students to book with VFS for a study application should be told.
2. It is a residence permit, not a visa. Over six months means Residence Permit - Student, applied for here, collected as a card in Austria. The vocabulary matters when reading the Embassy's own instructions.
3. The age line at 24 nearly doubles the money. EUR 722.58 a month against EUR 1,308.39, and twelve months has to be proven either way — roughly EUR 8,671 against EUR 15,700. Check the student's age at the date of application, not today, and note that accommodation above EUR 386.43 a month adds to it.
4. 90 days plus 90. Any request for further documents adds a second 90-day period. Treat six months as the realistic outer bound and start the attestation chain before admission is settled.
5. Ergaenzungspruefung. Where admission is conditional on supplementary examinations the timeline can move by a semester. Establish this at the offer stage — the tracker has a field for it.

All figures are the 2026 OeAD ones and are indexed annually. Re-check them here each year rather than leaving staff to discover a change.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'AT'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
