-- Italy's visa page.
--
-- Italy is the office's largest destination and the most thoroughly modelled
-- one already — CIMEA tracking, apostille, pre-enrolment, the DSU scholarship
-- machinery — but its visa page had no sections at all, so none of that
-- context reached the student reading it.
--
-- Three things here are worth flagging because they are recent, specific, or
-- contradicted elsewhere:
--
--   1. The money. The MUR circular for 2026/2027 and 2027/2028 lifted the
--      minimum from EUR 6,947.33 to EUR 10,179.85 a year — a 46.5% rise in one
--      year. The old figure, and the much older EUR 460.28 a month general
--      rate, are both still circulating. A family working from either is short
--      by thousands.
--
--   2. CIMEA, not a Declaration of Value. The consular checklist accepts a
--      CIMEA statement OR a DoV OR a CV. The office has settled on CIMEA
--      (see 0205), so the page says so and tells students not to pay for a DoV.
--
--   3. The permesso di soggiorno. Eight working days from arrival, and the
--      published consequence of missing it is expulsion, not a fine. That is
--      not something to leave to a phone call after the student has flown.
--
-- Sources: the Embassy of Italy Islamabad's own "where to apply" page for the
-- operator and the jurisdiction split, the Italian consular network's study
-- visa checklist for 2026-2027 | 2027-2028 for the document and financial
-- requirements, and universitaly.it for pre-enrolment.

-- ------------------------------------------------------------- the centre
-- 0199 left this row asking for the per-city detail. The embassy names the
-- operator as BLS-Intiana and publishes which cities fall under which mission,
-- which is the part that actually matters — a Karachi student who turns up in
-- Lahore is in the wrong consular district, not merely the wrong queue.
update public.visa_offices
set name = 'BLS-Intiana Italy Visa Application Centre',
    operator = 'BLS-Intiana',
    jurisdiction = 'Islamabad, Lahore, Multan and Faisalabad fall under the Embassy in Islamabad. Karachi and Quetta fall under the Consulate General in Karachi.',
    appointment_url = 'https://www.intianaitalyvisa.com/',
    notes = 'Study visa applications are lodged here, not at the Embassy. Appointments are booked on the Intiana website. Apply at a centre in your own consular district — Islamabad, Lahore, Multan and Faisalabad for the Embassy; Karachi and Quetta for the Consulate General. Check the site for your city''s address and current timings.',
    internal_notes = 'Per-city street addresses are not published in one place; the booking site gives the location for the city chosen. Operator and district split confirmed against the Embassy''s own "where to apply" page.',
    source_url = 'https://ambislamabad.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/dove-chiedere-un-visto/',
    verified_at = now()
where name = 'BLS Italy Visa Application Centre'
  and internal_notes = 'Per-city addresses and timings not yet confirmed against the BLS site.';

-- ------------------------------------------------------------- the sections
insert into public.visa_page_sections
  (destination_id, title, body, link_label, link_url, audience, sort_order)
select d.id, s.title, s.body, s.link_label, s.link_url, s.audience, s.sort_order
from public.destinations d
cross join (values

  (10, 'both', 'How the application works',
   $$Italy's student visa is a national (type D) visa, for a course longer than 90 days.

Three things happen in order:

1. Pre-enrolment on Universitaly. Every non-EU applicant living outside Italy has to do this. It produces a pre-enrolment Summary, and the visa application needs two printed copies of it.
2. The admission letter from the university, and payment of the enrolment fee.
3. The visa application, lodged in person at a BLS-Intiana centre. The Embassy or the Consulate General decides it — the centre only collects it.

One exception worth knowing early: if your admission depends on an entrance test you will sit in Italy, that changes which visa you need. Tell your counsellor which tests you are taking before anything is booked.$$,
   'Universitaly pre-enrolment', 'https://www.universitaly.it'),

  (20, 'both', 'Which centre is yours',
   $$BLS-Intiana runs the centres, and which one you use is decided by where you live, not by which has the shorter wait.

- Islamabad, Lahore, Multan and Faisalabad — under the Embassy of Italy, Islamabad.
- Karachi and Quetta — under the Consulate General of Italy, Karachi.

Applying outside your own consular district does not work. Book the appointment yourself on the Intiana site, with your own email address and phone number.$$,
   'Book at Intiana', 'https://www.intianaitalyvisa.com/'),

  (30, 'both', 'CIMEA, not a Declaration of Value',
   $$Italy will accept either a CIMEA Statement of Comparability or a Declaration of Value (DoV) issued by an Italian mission. HMARK uses CIMEA.

Do not pay for a Declaration of Value. Do not let anyone send you to the consulate for one. The CIMEA statement is obtained online and your counsellor tracks it — the documentation tracker has a CIMEA status field for exactly this.

Allow real time for it. CIMEA has a standard and an urgent route, and the standard one is not quick.$$,
   'CIMEA statements', 'https://www.cimea.it/'),

  (40, 'both', 'Attestation and apostille',
   $$Every academic document goes through two steps, in this order, and neither can be skipped.

1. Attestation — school and intermediate documents by IBCC, degrees and transcripts by HEC.
2. Apostille — after attestation, not before.

Take originals and a colour copy of each. The consulate keeps copies and checks them against the originals.

If your name is written differently on your passport and on any other document — a middle name on one and not the other counts — you need a "One and the Same" certificate, itself attested and apostilled. Sort this out early; it is a common reason a file is sent back.$$,
   null, null),

  (50, 'both', 'The money rule',
   $$You have to show at least EUR 10,179.85 for one year, or EUR 848.32 for each month of the stay.

This figure went up sharply. It was EUR 6,947.33, and older guides quote a general rate of about EUR 460 a month that has nothing to do with student visas any more. Anyone working from either of those is thousands of euros short.

What the consulate wants to see:

- Six months of original bank statements, stamped and signed by the branch manager. Not a printout, not an app screenshot.
- Documents showing where the money comes from — employment or business, income certificates.
- The enrolment fee payment visible on those same statements.

If a sponsor is funding you, their six months of statements come too, with their ID, a sponsorship letter and their proof of income — alongside your own statements, not instead of them.

An education loan counts only if the money has actually been deposited and shows on the statements. A sanction letter on its own does not.

A scholarship award is accepted in original. If it is worth less than the minimum, make up the difference from the documents above.$$,
   null, null),

  (60, 'both', 'Insurance, accommodation and tickets',
   $$Three requirements that get overlooked because they feel like afterthoughts.

Medical insurance — at least EUR 30,000 of cover, valid for your first six months in Italy, and it must include a repatriation clause. A Schengen-compliant travel medical policy or an Italian insurer.

Accommodation — proof of board and lodging for at least 30 days. A hotel booking, a signed rent agreement, or a signed contract for university accommodation.

Tickets — a return flight reservation with a PNR the consulate can verify. They do check it. Alternatively you can show funds on top of the minimum instead of a booking, but the booking is simpler.$$,
   null, null),

  (70, 'both', 'Language certificate',
   $$If the course is taught in English, you need a B2-level certificate from a recognised provider — British Council, Cambridge, ETS, Pearson or Trinity College London — or a Medium of Instruction declaration from the institution where you last studied.

If the course is taught in Italian, you need B2 in Italian.

Check which one your programme actually requires before booking a test. An MOI letter is free and is accepted in place of an English certificate in many cases; a test is not.$$,
   null, null),

  (80, 'both', 'What to take to the appointment',
   $$- Passport: issued within the last ten years, at least two blank pages, and valid for at least three months beyond the visa
- Application form, signed, with one recent passport photograph on a white background — do not staple it
- Covering letter: one page on why this course, this university, how it is funded and where you will live
- Admission letter, and two printed copies of the Universitaly pre-enrolment Summary
- Receipt for the enrolment fee
- Degrees, certificates and transcripts — attested, apostilled, originals plus colour copies
- CIMEA Statement of Comparability
- Six months of bank statements, stamped and signed
- Medical insurance certificate
- Accommodation proof
- Flight reservation
- Language certificate or MOI declaration

Take the originals. Everything on this list is checked against them.$$,
   null, null),

  (90, 'both', 'How long it takes',
   $$Allow up to 90 days. That is the legal maximum for a national study visa and the consular network works to it — there is no expediting it, and asking pushes you behind people who applied earlier.

There is also a cut-off for each intake, after which applications for that academic year are simply not accepted. For the 2026/2027 intake the published date is 30 November 2026. Confirm the exact date for your own mission with your counsellor, and do not plan to be near it.

Counting backwards: pre-enrolment, then admission, then CIMEA, then attestation and apostille, then the appointment, then ninety days. This is a year-long sequence.$$,
   null, null),

  (100, 'both', 'After you arrive: the permesso di soggiorno',
   $$You must apply for a residence permit — permesso di soggiorno — within eight working days of arriving in Italy.

You collect the yellow kit from a post office, fill it in and hand it back there. The Questura issues the permit, and the card itself takes two or three months to come. Keep the post office receipt with your passport in the meantime; that receipt is what proves you applied.

Eight working days is short and it is not treated as a formality. Applying late can lead to expulsion, so do it in your first week rather than after you have settled in.$$,
   null, null),

  (110, 'staff', 'Note for the counsellor',
   $$Six things specific to Italy:

1. The money figure moved a long way. EUR 10,179.85 a year from the 2026/2027 circular, up from EUR 6,947.33. Older checklists and the general EUR 460-a-month rate are both still in circulation and both are now badly wrong. Check any figure a family quotes.
2. CIMEA only. The consular checklist accepts CIMEA or a DoV; the office has settled on CIMEA. Nobody should be paying for a Declaration of Value.
3. Entrance tests change the visa. Where admission depends on a test sat in Italy, the D visa is issued with validity to 31 January of the intake year. Where the student must sit a test before their final certificate is even issued, the consular checklist puts them on a short-term C visa instead. Establish which applies before an appointment is booked — the tracker's admission tests field is the place to look.
4. Consular district is absolute. Islamabad, Lahore, Multan, Faisalabad to the Embassy; Karachi, Quetta to the Consulate General.
5. Name mismatches. A "One and the Same" certificate, attested and apostilled, is needed where the passport and the academic documents differ at all. It surfaces late and delays files.
6. The intake cut-off. 30 November 2026 for the 2026/2027 intake per the consular checklist for 2026-2027 | 2027-2028. That checklist is the Italian consular network's standard form rather than an Islamabad-specific publication, so confirm the date with the mission before treating it as the deadline you plan against.

The consulate discourages agents from involving themselves in the application. Students book with their own email and phone number.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'IT'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
