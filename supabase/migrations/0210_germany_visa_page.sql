-- Germany's visa page, and the contact details 0199 left open on both missions.
--
-- Germany differs from Spain and France in two ways that change the order the
-- page has to be written in:
--
--   1. Since 1 January 2025 the national visa procedure is online first. You
--      file the application in the Federal Foreign Office's Consular Services
--      Portal and are offered an appointment afterwards. Students still arrive
--      expecting to book an appointment and bring papers to it, which is the
--      old procedure and is no longer how it works.
--
--   2. There are two missions with a hard provincial split. An applicant from
--      Sindh cannot use Islamabad.
--
-- The APS section is a deliberate negative. Pakistani students are widely told
-- they need an APS certificate, and it is sold to them; APS operates in China,
-- Vietnam and India, and the German mission in Pakistan's own study visa page
-- never mentions it. Saying so plainly is worth more here than another
-- checklist item, because the cost of the misconception is months and money.
--
-- Sources: the Federal Foreign Office's own country page for Pakistan and its
-- Consular Services Portal pages, the mission's study visa page at
-- pakistan.diplo.de, and uni-assist for the APS country list.

-- ------------------------------------------------------------- the missions
update public.visa_offices
set address = 'Ramna 5, Diplomatic Enclave, Islamabad (P.O. Box 1027)',
    phone = '+92 51 2007 100',
    email = 'visainfo@isla.diplo.de',
    office_hours = 'Oct-Apr: Mon-Thu 08:00-13:00 and 13:30-16:30, Fri 08:00-13:30. May-Sep: Mon-Wed 08:00-13:00 and 13:30-15:00, Thu to 16:00, Fri 08:00-13:30.',
    jurisdiction = 'Punjab, Khyber Pakhtunkhwa, FATA, Gilgit-Baltistan, AJK and Islamabad',
    appointment_url = 'https://app.digital.diplo.de/',
    notes = 'National (study) visa applications for applicants outside Sindh and Balochistan. Apply in the Consular Services Portal first; the appointment comes afterwards. The switchboard number does not take visa enquiries — use the email above.',
    internal_notes = null,
    source_url = 'https://www.auswaertiges-amt.de/en/aussenpolitik/laenderinformationen/pakistan-node/pakistan-209322',
    verified_at = now()
where name = 'German Embassy Islamabad'
  and internal_notes = 'Address, phone and hours still to be confirmed from the mission''s own contact page.';

update public.visa_offices
set address = '92-A/7, Block 5, Clifton, Karachi',
    phone = '+92 21 3587 3782 / +92 21 3583 9936 / +92 21 3583 9697',
    office_hours = 'Visa section Mon-Fri 08:00-12:30. General: Mon-Thu 07:30-15:15, Fri 07:30-13:30.',
    jurisdiction = 'Sindh and Balochistan',
    appointment_url = 'https://app.digital.diplo.de/',
    notes = 'National (study) visa applications for Sindh and Balochistan. Apply in the Consular Services Portal first; the appointment comes afterwards.',
    internal_notes = null,
    source_url = 'https://www.auswaertiges-amt.de/en/aussenpolitik/laenderinformationen/pakistan-node/pakistan-209322',
    verified_at = now()
where name = 'German Consulate General Karachi'
  and internal_notes = 'Contact details still to be confirmed.';

-- ------------------------------------------------------------- the sections
insert into public.visa_page_sections
  (destination_id, title, body, link_label, link_url, audience, sort_order)
select d.id, s.title, s.body, s.link_label, s.link_url, s.audience, s.sort_order
from public.destinations d
cross join (values

  (10, 'both', 'How the application works',
   $$Germany's student visa is a national (type D) visa, and since 1 January 2025 it is applied for online.

You file the application in the Federal Foreign Office's Consular Services Portal — create an account, complete the form, upload the documents. The mission reviews it and then offers you an appointment.

That order matters. You do not book an appointment and bring papers to it; the file goes in first. Students working from older guides try to book first and find there is nothing to book.

Take a printed copy of the booking confirmation and the full file, originals included, to the appointment.$$,
   'Consular Services Portal', 'https://app.digital.diplo.de/'),

  (20, 'both', 'Which mission is yours',
   $$Germany has two missions in Pakistan and the split is by province, not by preference.

- German Embassy Islamabad — Punjab, Khyber Pakhtunkhwa, FATA, Gilgit-Baltistan, AJK and Islamabad.
- German Consulate General Karachi — Sindh and Balochistan.

You cannot choose the one with the shorter wait. Applying to the wrong mission wastes the appointment.$$,
   null, null),

  (30, 'both', 'You do not need an APS certificate',
   $$This is worth saying plainly, because Pakistani students are often told otherwise and are sometimes sold one.

The Akademische Pruefstelle (APS) operates for applicants from China, Vietnam and India. Pakistan is not one of them, and the German mission in Pakistan does not ask for an APS certificate on its student visa page.

Your academic documents are checked during the university application instead — through uni-assist, or by the university's own admissions office, with IBCC and HEC attestation as required.

If anyone tells you to buy an APS certificate for a German university application from Pakistan, check with your counsellor before paying for anything.$$,
   null, null),

  (40, 'both', 'The blocked account',
   $$Germany wants the year's living costs paid into a blocked account (Sperrkonto) before the visa is granted.

For 2026 that is EUR 11,904 for the year, which is EUR 992 a month. The account releases one twelfth to you each month once you are in Germany — you cannot draw it all at once, which is the point of it.

Open it with a provider the mission accepts and have the confirmation ready before the appointment. A scholarship award, or a formal declaration of commitment from a sponsor in Germany, can stand in place of the blocked account.

The amount is reset periodically. Confirm the current figure before anyone transfers money.$$,
   null, null),

  (50, 'both', 'Getting the offer first',
   $$The visa needs an unconditional admission letter — the Zulassungsbescheid. A conditional offer, or a place at a Studienkolleg, is a different conversation; tell your counsellor which one you have.

Most applications go through uni-assist, which checks foreign qualifications on the universities' behalf. Some universities take applications directly instead. Your tracker records which route you are on.

Where uni-assist is used you may be issued a VPD (Vorpruefungsdokumentation) — a preliminary review of your qualifications that universities ask for. Allow weeks for it, not days.

Degrees and transcripts need HEC attestation, and school documents need IBCC attestation, before any of this.$$,
   'uni-assist', 'https://www.uni-assist.de/en/'),

  (60, 'both', 'What to take to the appointment',
   $$- Printed confirmation of the portal booking
- Passport, and passport photographs to biometric specification
- The unconditional admission letter (Zulassungsbescheid)
- Blocked account confirmation, or scholarship or sponsor documents
- Proof of health insurance valid from the day you arrive
- Past degree certificates and transcripts — school, bachelor's, any master's
- IBCC and HEC attestation on those documents
- Language certificate for the language your course is taught in
- Proof of tuition payment, where the course charges it
- Motivation letter and CV

The mission's own page is explicit that degree certificates, transcripts and proof of tuition payment are required even where the portal marks them optional. Take them.$$,
   null, null),

  (70, 'both', 'Fees, and how long it takes',
   $$The national visa fee is EUR 75, paid in rupees, and it is not refunded if the application is refused. Holders of a German public scholarship, DAAD included, are exempt.

There is no published processing time. The mission says it handles student applications in the order they are received and that the volume is high.

Two waits, not one: the wait for an appointment after the portal application, and then the decision. Appointment waits run to several weeks or months between May and August, which is exactly when most students need one. Start in the portal as early as you can — the file can be in the queue before term dates are settled.$$,
   null, null),

  (80, 'both', 'After you arrive',
   $$The visa gets you in. Two things turn it into permission to stay, and both have deadlines.

Anmeldung — register your address at the local Buergeramt within two weeks of moving in. Almost nothing else works until this is done: no bank account, no residence permit, no enrolment in some cities.

Residence permit — apply at the Auslaenderbehoerde before the visa runs out. The visa is usually issued for months, not years, and the permit replaces it. Book that appointment as soon as you have registered, because in the larger cities the wait is long.$$,
   null, null),

  (90, 'staff', 'Note for the counsellor',
   $$Five things specific to Germany:

1. The order changed. Portal application first, appointment second, since January 2025. Any guide describing "book an appointment at the embassy" is pre-2025 and will send a student looking for something that does not exist.
2. APS. Pakistani students get told they need one and are sometimes charged for it. They do not — APS covers China, Vietnam and India. Correct this early; it wastes months.
3. The province split is absolute. Sindh and Balochistan go to Karachi, everyone else to Islamabad.
4. The blocked account figure moves. EUR 11,904 for 2026. Check it before a family transfers money, and remember a sponsor's declaration of commitment or a scholarship can replace it.
5. May to August is the crush. An appointment can be months out in that window, so the portal application wants to be in well before the admission letter is in hand where that is possible.

The switchboard numbers on both missions do not take visa enquiries. Use the visa email for Islamabad.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'DE'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
