-- Canada's visa page.
--
-- Canada has changed more than any other destination in the last two years,
-- and almost every change moved against the student. Three of them are recent
-- enough that guides, agents and older checklists are still describing a world
-- that no longer exists:
--
--   1. The Student Direct Stream closed on 8 November 2024. A GIC is no longer
--      mandatory for anything — it is one accepted proof of funds among
--      several. Anyone still telling a family "you must buy a GIC for SDS" is
--      describing a stream that has not existed for nearly two years.
--
--   2. Proof of funds is CAD 23,448 for a single applicant for applications on
--      or after 1 September 2026, up from 22,895. Living costs only: it does
--      not include tuition or airfare.
--
--   3. From 1 January 2026, master's and doctoral students at a public DLI no
--      longer need a Provincial Attestation Letter. That is the single most
--      useful thing on this page for our students, because Canada's seeded
--      universities here are all public and most of our applicants are going
--      for a master's. Undergraduates still need one.
--
-- Like Australia, nothing is lodged at a counter — the application is filed in
-- the IRCC portal and the only in-person step is biometrics. So the
-- where-to-apply summary renders nothing, which is correct.
--
-- Sources: IRCC's own pages on financial support, the PAL/TAL requirement and
-- PGWP eligibility; the High Commission's page at international.gc.ca for
-- contact details; VFS Global for the biometric centres.

-- ------------------------------------------------------------- the offices
update public.visa_offices
set address = 'Diplomatic Enclave, Sector G-5, Islamabad',
    phone = '+92 51 208 6000',
    office_hours = 'Mon-Thu 08:00-17:00, Fri 08:00-12:30, by appointment. Consular: Mon-Thu 09:30-15:00.',
    submits_applications = false,
    notes = 'Study permits are not applied for here. The application is filed online in the IRCC portal, and immigration enquiries go through IRCC''s web form rather than to this office. Consular (not visa) matters: islamabad.consular@international.gc.ca',
    internal_notes = null,
    source_url = 'https://www.international.gc.ca/country-pays/pakistan/islamabad.aspx?lang=eng',
    verified_at = now()
where name = 'High Commission of Canada to Pakistan'
  and verified_at is null;

insert into public.visa_offices
  (destination_id, kind, name, city, operator, website, appointment_url,
   submits_applications, notes, internal_notes, source_url, verified_at, sort_order)
select d.id, 'visa_centre', 'Canada Visa Application Centre', 'Islamabad, Lahore, Karachi',
  'VFS Global',
  'https://visa.vfsglobal.com/pak/en/can/',
  'https://visa.vfsglobal.com/pak/en/can/',
  -- Biometrics only. The study permit application itself is online, so there
  -- is no lodgement queue and the page must not imply one.
  false,
  'Where you give fingerprints and a photograph, after you have applied online and IRCC has issued your Biometrics Instruction Letter. You book the appointment on the VFS site using the letter''s details. Centres are in Islamabad, Lahore and Karachi; slots tighten around the main intakes.',
  'Cities confirmed from VFS''s Pakistan-Canada portal. Street addresses are only inside the booking flow, which blocks automated requests, so they are not captured here.',
  'https://visa.vfsglobal.com/pak/en/can/',
  now(),
  10
from public.destinations d
where d.country_code = 'CA'
  and not exists (
    select 1 from public.visa_offices v
    where v.destination_id = d.id and v.name = 'Canada Visa Application Centre'
  );

-- ------------------------------------------------------------- the sections
insert into public.visa_page_sections
  (destination_id, title, body, link_label, link_url, audience, sort_order)
select d.id, s.title, s.body, s.link_label, s.link_url, s.audience, s.sort_order
from public.destinations d
cross join (values

  (10, 'both', 'How the application works',
   $$What you are applying for is a study permit, not a visa. The permit is what lets you study; a travel document to enter Canada is issued alongside it.

1. Get a letter of acceptance from a Designated Learning Institution (DLI). Only DLIs can host international students.
2. Check whether you need a Provincial Attestation Letter — see the next section, because this changed in January 2026.
3. Apply online in the IRCC portal and pay the fees.
4. IRCC sends you a Biometrics Instruction Letter. You then book a biometrics appointment at a Canada Visa Application Centre.
5. A medical examination, where your case requires one.

Nothing is handed in at the High Commission in Islamabad, and immigration questions go through IRCC's web form rather than to that office.$$,
   'Apply for a study permit', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html'),

  (20, 'both', 'Do you need a Provincial Attestation Letter?',
   $$Since January 2024 most study permit applications have needed a PAL or TAL — a letter from the province confirming a place within its share of Canada's cap. Without it the application is returned as incomplete.

This changed on 1 January 2026. A student starting a degree-granting master's or doctoral programme at a public DLI no longer needs one. Most of our Canadian applicants fall into that group, and most of the universities on our list are public.

Still need one:
- undergraduate applicants, and non-degree programmes
- anyone at a private institution

Quebec is separate. A student going to Quebec needs a CAQ — Quebec Acceptance Certificate — instead of a PAL.

Ask your counsellor to confirm which of these applies to you before you apply, because getting it wrong means the file comes straight back.$$,
   'PAL/TAL requirement', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/provincial-attestation-letter.html'),

  (30, 'both', 'The Student Direct Stream no longer exists',
   $$SDS closed on 8 November 2024. There is one study permit stream now, and everybody uses it.

The consequence people miss: a GIC is no longer compulsory. Under SDS you had to buy a Guaranteed Investment Certificate. Today it is simply one accepted way of proving funds, alongside bank statements, a loan, a scholarship or a sponsor's documents.

A GIC can still be the tidiest evidence, and some families prefer it. But if anyone tells you a GIC is required, or offers to arrange "SDS processing", they are describing something that was withdrawn nearly two years ago.$$,
   null, null),

  (40, 'both', 'The money',
   $$For applications submitted on or after 1 September 2026, a single applicant must show CAD 23,448 for the year. It was CAD 22,895 before that.

That figure is living costs only. It does not include your tuition and it does not include your airfare — those are on top of it.

What IRCC will accept as proof, in any workable combination:
- six months of bank statements, for a Canadian or a foreign account
- a Guaranteed Investment Certificate
- proof that tuition has been paid
- a student or education loan from a bank
- a scholarship or funded programme
- a letter from whoever is funding you, with their own evidence of income

You do not need all of it. You need enough to show the money is really there and really available to you.$$,
   'Proof of financial support', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/financial-support.html'),

  (50, 'both', 'What it costs',
   $$- Study permit application: CAD 150
- Biometrics: CAD 85, or CAD 170 at most for a family applying together

The biometrics appointment itself is free. You pay the CAD 85 to IRCC with your application, and nothing to anyone for the slot. If somebody offers to sell you a biometrics appointment, walk away.

On top: the medical examination where one is required, and the cost of whatever you use to prove your funds.$$,
   null, null),

  (60, 'both', 'Biometrics',
   $$Wait for the Biometrics Instruction Letter. IRCC issues it after you have applied and paid; the letter carries the reference the appointment is booked against.

Then book on the VFS site for Islamabad, Lahore or Karachi. Take the letter and your passport.

Slots usually appear within a week or two, but they get scarce around the main intakes — which is exactly when most students need them. Book as soon as the letter arrives rather than leaving it.$$,
   'Book at a Canada VAC', 'https://visa.vfsglobal.com/pak/en/can/'),

  (70, 'both', 'What to have ready',
   $$- Letter of acceptance from a DLI
- Provincial Attestation Letter, if your case still needs one — or a CAQ for Quebec
- Passport
- Proof of funds, as set out above
- Proof of tuition payment, where you have paid any
- Academic transcripts and degrees, with IBCC and HEC attestation
- English language results as your institution required them
- A statement of purpose explaining the course and how it follows from what you have done
- Medical examination, where required
- Passport photographs to IRCC's specification

Where a document is not in English or French, a certified translation goes with it.$$,
   null, null),

  (80, 'both', 'Working while you study',
   $$Up to 24 hours a week off campus during academic sessions, and full time during the institution's scheduled breaks.

That limit went up from 20 hours in November 2024, so older guidance understates it.

The permission comes with the study permit — there is no separate work permit to apply for and no extra fee. The conditions are printed on the permit itself, so read them when it arrives rather than relying on what you were told beforehand.$$,
   null, null),

  (90, 'both', 'After you graduate: the work permit is not automatic',
   $$The Post-Graduation Work Permit is the reason many students choose Canada, and the rules tightened for anyone whose study permit application went in on or after 1 November 2024.

Field of study: no restriction for bachelor's, master's or doctoral graduates. It bites on college, polytechnic and other non-degree programmes, where the programme has to be linked to an occupation in long-term shortage.

Language: this one catches degree graduates. A university graduate now needs CLB 7 in English across all four abilities — reading, writing, listening and speaking. All four; a strong overall score with one weak band is not enough. College graduates need CLB 5.

Plan for the test rather than discovering it at the end of your course.$$,
   'PGWP eligibility', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation/eligibility.html'),

  (100, 'staff', 'Note for the counsellor',
   $$Canada has moved more than any other destination we handle, and most of our reference material predates the changes. Five things:

1. The PAL exemption is the headline. From 1 January 2026, degree-granting master's and doctoral programmes at a public DLI need no Provincial Attestation Letter. Our Canadian universities are public, and most of our applicants are master's — so for many cases the cap and the PAL simply do not apply. Undergraduates and private institutions still need one; Quebec needs a CAQ instead. Establish which before promising anything.
2. SDS closed 8 November 2024 and a GIC is not compulsory. If anyone on the team still describes SDS, or an agent offers "SDS processing", correct it. The GIC is one proof of funds among several.
3. CAD 23,448 since 1 September 2026, up from 22,895, and it excludes tuition and airfare. Families routinely believe the figure covers fees.
4. The PGWP language rule is the quiet one. Since 1 November 2024 a university graduate needs CLB 7 in all four bands. Students choose Canada for the PGWP and then find it conditional at the end. Raise it at the counselling stage, not in the final semester.
5. Biometrics appointments are free and booked on VFS after IRCC's instruction letter. Nobody should be paying for a slot.

Nothing is lodged at the High Commission, and IRCC asks that enquiries go through its web form rather than the Islamabad office — so there is no one to ring and chase.

Canada has one tracker field and one document template in the portal. If Canada volume grows, it needs the same treatment Italy and the UK have had.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'CA'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
