-- Northern Cyprus's visa page.
--
-- Northern Cyprus is unlike every other destination here in two ways that
-- decide the shape of the page.
--
-- First, the TRNC's own visa is the easy part. It is applied for online, there
-- is no visa centre in Pakistan, and the student category exists on the
-- official eVisa system. The hard part is Turkey. Since 15 August 2023 Turkey
-- has required a double transit visa from third-country nationals travelling
-- to the TRNC through Turkish airports, and every realistic route from
-- Pakistan runs through Istanbul. Turkey's own ministry puts Pakistan on the
-- conditional e-Visa list — available only to holders of a valid Schengen,
-- US, UK or Ireland visa or residence permit — and says the e-Visa is valid
-- only for tourism or commerce. So for most of our students the transit needs
-- a visa from a Turkish consulate, obtained before flights are booked. That is
-- the step most likely to strand somebody who has already paid.
--
-- Second, recognition. HEC gives no blanket recognition to Northern Cyprus
-- universities; it issues equivalence letters case by case, and it varies by
-- institution and even by programme. A student who returns with a degree HEC
-- will not issue equivalence for has a problem no visa page can fix later, so
-- that warning sits before the paperwork rather than after it.
--
-- One deliberate honesty: sources disagree about whether a Pakistani national
-- MUST hold a TRNC visa before arrival. The TRNC Ministry of Foreign Affairs'
-- own regulations name only Syria, Nigeria and Armenia as having to apply in
-- person, and put everyone else on visa-on-arrival. Several TRNC universities'
-- own pages list Pakistan as a fourth country that must apply in advance. The
-- page does not pick a side — it says apply in advance regardless, because
-- holding a visa you did not strictly need has no downside and the reverse
-- strands a student at a border.
--
-- Sources: mfa.gov.ct.tr visa regulations, the TRNC eVisa portal, Turkey's
-- Ministry of Foreign Affairs visa information for foreigners, TRNC
-- university international-office pages, and HEC's degree attestation guidance.

-- ------------------------------------------------------------- the office
update public.visa_offices
set city = 'Nicosia (no office in Pakistan)',
    phone = '+90 392 611 10 10',
    email = 'evisa@kktc-evize.gov.ct.tr',
    notes = 'Northern Cyprus issues its student visa online through the official eVisa system — there is no visa centre or mission in Pakistan, and nothing to attend in person here. The email and number above are the eVisa service desk. Note that travelling there also needs Turkish permission to transit, which is a separate matter handled by the Turkish Consulate.',
    internal_notes = 'The TRNC has no mission in Pakistan, so this row stands for the online route rather than a place. Contact details are the eVisa service desk from the portal. The Turkish transit visa is deliberately not recorded as an office here — it is another country''s mission and listing it would imply the TRNC visa is obtained there; it is covered in the page sections instead.',
    source_url = 'https://kktc-evize.gov.ct.tr/en',
    verified_at = now()
where name = 'TRNC Ministry of Foreign Affairs'
  and verified_at is null;

-- ------------------------------------------------------------- the sections
insert into public.visa_page_sections
  (destination_id, title, body, link_label, link_url, audience, sort_order)
select d.id, s.title, s.body, s.link_label, s.link_url, s.audience, s.sort_order
from public.destinations d
cross join (values

  (10, 'both', 'How it works, and the order it happens in',
   $$Four stages, and the second and third are the ones that go wrong.

1. Acceptance from the university. Everything else needs the acceptance or pre-registration letter.
2. The TRNC student visa, applied for online on the official eVisa system. There is no visa centre and no mission in Pakistan — nothing to attend in person here.
3. Turkish permission to transit. Every realistic route runs through Turkey, and that needs its own visa. See below; this is the step that strands people.
4. After you land, a student residence permit, which involves medical tests done locally.

The TRNC visa and the Turkish transit visa are two separate applications to two separate governments. Holding one says nothing about the other.$$,
   'TRNC eVisa (student category)', 'https://kktc-evize.gov.ct.tr/en'),

  (20, 'both', 'Apply for the TRNC visa before you travel',
   $$Do this in advance even though you may hear that you can get a visa on arrival.

The position is genuinely unclear. The TRNC's own visa regulations name only Syria, Nigeria and Armenia as nationalities that must apply before travelling, and put everyone else on a visa issued by the immigration officer on arrival. But several Northern Cyprus universities list Pakistan as a fourth country that has to apply in advance.

We do not ask you to work out who is right. Apply in advance through the eVisa system, in the student category. Holding a visa you did not strictly need costs you nothing; arriving without one that you did need is a flight home.

One thing the TRNC says plainly either way: a granted visa does not guarantee entry. The immigration officer at the port makes the final decision, so carry your acceptance letter and your original academic documents in your hand luggage, not in your suitcase.$$,
   null, null),

  (30, 'both', 'The Turkish transit visa — do this before booking flights',
   $$This is the part that catches people, and it is not the TRNC's rule.

Since 15 August 2023 Turkey has required a double transit visa from third-country nationals travelling to Northern Cyprus through Turkish airports. Flights from Pakistan to Ercan go via Istanbul, so this applies to essentially every student.

Turkey's own ministry places Pakistan on its conditional e-Visa list: the online e-Visa is only open to Pakistani nationals who already hold a valid Schengen, United States, United Kingdom or Ireland visa or residence permit — and even then it is valid only for tourism or commerce, not study. So unless you hold one of those, the few-minutes-online route is not available to you and the transit visa has to come from a Turkish consulate.

Sort this out before you buy a ticket. A consulate appointment takes time, and a student who has paid tuition and booked flights and then cannot transit Turkey has nowhere useful to be.$$,
   'Turkish visa information', 'https://www.mfa.gov.tr/visa-information-for-foreigners.en.mfa'),

  (40, 'both', 'Check HEC will recognise the degree — before you enrol',
   $$This one is about after you graduate, but it has to be decided before you start.

HEC does not recognise Northern Cyprus universities as a group. It issues equivalence letters case by case, and the answer can differ between one institution and another and even between programmes at the same institution. A degree HEC will not issue equivalence for is a problem for government employment and for further study in Pakistan, and nothing can be done about it afterwards.

So ask HEC in writing about your specific university and your specific programme before you accept an offer, and keep the reply. Your counsellor can help with the wording.

Institutions with the widest accreditation — Eastern Mediterranean University and the Middle East Technical University Northern Cyprus Campus among them — are the safer ground, but ask anyway rather than assuming.$$,
   'HEC degree attestation and equivalence', 'https://www.hec.gov.pk/english/services/students/DAS/Pages/Degree-Attestation.aspx'),

  (50, 'both', 'What the visa application needs',
   $$- Passport
- Acceptance or pre-registration letter from the university
- The online visa application form, completed, then printed and signed
- Medical certificate — ours is done at Islamabad Diagnostic Center
- Academic documents, with IBCC attestation for school papers and HEC for degrees
- Travel insurance
- Passport photographs
- Proof that you can fund the course, and of any tuition already paid

Northern Cyprus does not publish a fixed monthly figure the way Spain or Italy do, so there is no number to hit. Show the tuition you have paid and funds that plainly cover living costs, and ask the university what it expects to see — it handles these applications constantly.

The visa fee is shown at the payment step of the online application.$$,
   null, null),

  (60, 'both', 'After you arrive: 60 days, and the medical tests',
   $$Showing your acceptance letter at the port gets you a 60-day student entry stamp. That is your window to turn up into a student residence permit, and it is not long.

In that time:

1. Complete your registration at the university.
2. Have the medical tests done locally. HIV, HBsAg, HCV, RPR and a chest X-ray for tuberculosis. The reports must be less than two months old when submitted, so have them done after you arrive rather than before.
3. Take them to the state hospital serving your university for approval, then upload the report to the university's student system.
4. The residence permit follows.

Budget around USD 200 for the laboratory work, plus the physician's report fee.

The medical certificate you supplied with the visa application does not replace these. They are a separate requirement and there is no way around them.$$,
   null, null),

  (70, 'staff', 'Note for the counsellor',
   $$Four things, and the first two are where cases actually fail.

1. The Turkish transit visa, not the TRNC visa, is the bottleneck. Turkey has required a double transit visa for TRNC-bound third-country nationals since 15 August 2023, and Turkey's ministry puts Pakistan on the conditional e-Visa list — online only for holders of a valid Schengen, US, UK or Ireland visa or residence permit, and even then only for tourism or commerce. For most of our students that means a consulate appointment. Start it before flights are booked, and treat it as the critical path rather than an afterthought.

2. HEC equivalence, before the offer is accepted. No blanket recognition for Northern Cyprus; HEC decides case by case and it can differ by programme. Get the question to HEC in writing and keep the answer on file. This is the one that produces an angry family three years later, and by then there is no remedy.

3. The advance-visa question is genuinely unresolved and the page says so. The TRNC Ministry of Foreign Affairs lists only Syria, Nigeria and Armenia as needing to apply in person; several TRNC universities list Pakistan as a fourth. We tell students to apply in advance either way. Do not let anyone travel on the strength of visa-on-arrival.

4. The 60-day window and the local medicals. Students arrive thinking the visa was the finish line. The permit needs tests done after arrival, reports under two months old, state hospital approval and about USD 200. Say it before departure so nobody is caught without the money.

Northern Cyprus has one tracker field in the portal and eight universities. If this destination grows it needs proper visa tracker fields — at present the visa page carries all of it.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'NC'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
