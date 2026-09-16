-- The UK's visa page.
--
-- The UK is the one destination where the rules are published clearly and in
-- English, and where students still get refused constantly — because the
-- failure is almost never "I did not know the rule", it is the maintenance
-- money held for the wrong 28 days, or a TB certificate from a clinic that is
-- not on the Home Office's list. So this page spends its length on the three
-- mechanical traps rather than on describing the visa.
--
-- Four things here are time-sensitive or widely misunderstood:
--
--   1. The Graduate route drops from 2 years to 18 months for applications
--      made on or after 1 January 2027. A student starting a one-year master's
--      now finishes after that date. "Two years post-study work" is being sold
--      to people who will not get it.
--
--   2. Dependants. Since 1 January 2024 a taught master's (RQF 7) carries no
--      right to bring family. Only doctorates, research degrees and
--      government-sponsored students qualify. This is the single most common
--      wrong assumption in the room.
--
--   3. ATAS takes at least 30 working days and must be done before the visa
--      application, not alongside it.
--
--   4. The 28-day rule is about when the money sat still, not how much it is.
--
-- All figures from gov.uk: the Student visa pages, the healthcare surcharge
-- page, the ATAS guidance and the Graduate visa page.

-- ---------------------------------------------------------------- the centre
update public.visa_offices
set appointment_url = 'https://visa.vfsglobal.com/pak/en/gbr/',
    notes = 'Biometrics and document submission for UKVI. You apply and pay online first, then book a VFS appointment — the centre does not decide anything. Centres are in Islamabad, Lahore, Karachi and Mirpur; the booking site gives the address for the city you pick.',
    internal_notes = 'VFS does not publish the per-city addresses and timings in one list — they appear once a city is selected in the booking flow, and VFS blocks automated requests, so this could not be captured here. Check the live site when a student needs an address.',
    verified_at = now()
where name = 'UK Visa Application Centre'
  and internal_notes = 'Per-city addresses and timings not yet confirmed on VFS.';

-- --------------------------------------------------------------- the sections
insert into public.visa_page_sections
  (destination_id, title, body, link_label, link_url, audience, sort_order)
select d.id, s.title, s.body, s.link_label, s.link_url, s.audience, s.sort_order
from public.destinations d
cross join (values

  (10, 'both', 'How the application works',
   $$You cannot start until the university issues your CAS — the Confirmation of Acceptance for Studies. It carries a reference number the visa application needs, and it is only issued once the offer is unconditional and any deposit is paid.

Then, in this order:

1. Apply online on gov.uk, up to six months before the course starts.
2. Pay the visa fee and the healthcare surcharge in the same session.
3. Book a biometrics appointment at a VFS centre and take your documents.

The VFS centre collects fingerprints and papers. The decision is the Home Office's, and nobody at the centre can influence it.$$,
   'Apply on gov.uk', 'https://www.gov.uk/student-visa'),

  (20, 'both', 'Where you go',
   $$Biometrics and documents go to a UK Visa Application Centre, run by VFS Global. There are centres in Islamabad, Lahore, Karachi and Mirpur.

The British High Commission does not take visa applications. Do not go there and do not ring them about your application.

Book the appointment yourself after the online application is paid for — the booking site gives the address for whichever city you choose.$$,
   'VFS Global Pakistan', 'https://visa.vfsglobal.com/pak/en/gbr/'),

  (30, 'both', 'The money rule, and the 28 days',
   $$Two parts, and you need both.

Course fees — the first year's tuition, less anything you have already paid. If the CAS shows a deposit received, you only need the balance.

Living costs — GBP 1,529 a month for a course in London, or GBP 1,171 a month outside London, for up to nine months. That is GBP 13,761 for London and GBP 10,539 elsewhere. Your tracker records which band you are in.

Now the part that causes the refusals. The money must have been in the account for 28 days in a row, and the closing balance must never dip below the required total on any day in that window — not once. A single day where a transfer drops the balance restarts the 28 days.

The statement's end date must be within 31 days of the day you apply. So there is a window: the 28 days have to finish, and then you have 31 days to apply before the evidence goes stale.

Pakistani applicants have to submit the evidence, not just declare it. Bank statements or a bank letter, on the bank's own stationery, showing the account holder's name, the account number, the date, and the bank's contact details.$$,
   'Finance guidance', 'https://www.gov.uk/student-visa/money'),

  (40, 'both', 'The TB test',
   $$Anyone who has lived in Pakistan for six months or more and is coming to the UK for six months or more needs a tuberculosis test before applying.

The clinic must be on the Home Office's own list. This is not a formality — a certificate from an excellent hospital that is not on the list is refused, and you will have to sit the test again.

The certificate is valid for six months from the date of the x-ray, so do not take it too early either.$$,
   'Approved clinics in Pakistan', 'https://www.gov.uk/government/publications/tuberculosis-test-for-a-uk-visa-clinics-in-pakistan'),

  (50, 'both', 'ATAS, if your course needs one',
   $$Some postgraduate courses in sensitive technical and scientific subjects need an ATAS certificate. Pakistani nationals are not exempt from it.

Your university will tell you whether your course requires one, and the CAS usually says so. Ask them directly if it does not.

It takes at least 30 working days — about six weeks — and sometimes longer. It has to be granted before you apply for the visa, not at the same time. A student who discovers this late loses a month and a half.$$,
   'ATAS guidance', 'https://www.gov.uk/guidance/academic-technology-approval-scheme'),

  (60, 'both', 'What it costs',
   $$- Visa application: GBP 558, applying from outside the UK
- Healthcare surcharge: GBP 776 for each year of the visa, paid up front in one go

The surcharge is charged on the length of the visa, not the length of the course, and a one-year master's is usually given a visa a few months longer than the teaching. Budget for more than twelve months of it.

Both are paid online when you apply, and neither is refunded if the application is refused. The VFS centre charges separately for optional services; none of them is required.$$,
   null, null),

  (70, 'both', 'What to take to the appointment',
   $$- Passport, with a blank page for the vignette
- The CAS reference number from your university
- Proof of the money — statements or a bank letter covering the 28 days
- TB test certificate from an approved clinic
- Qualifications the CAS lists as the basis of your offer
- English language certificate, if your university required a SELT
- ATAS certificate, if your course needs one
- Parental consent and birth certificate, if you are under 18

Where a document is not in English, take a certified translation with it.$$,
   null, null),

  (80, 'both', 'How long it takes',
   $$A decision usually comes within three weeks of the biometrics appointment when you apply from outside the UK.

You can apply up to six months before the course starts, and there is no reason to wait. The three weeks is from the appointment, and appointment slots are the part that gets scarce in the summer.

Faster services are sold at some centres. They are genuinely faster, but they do not make a weak application stronger.$$,
   null, null),

  (90, 'both', 'Bringing family',
   $$Most students cannot, and this catches people out.

You can only bring a partner or children if you are:
- on a PhD, doctorate or other research-based higher degree, or
- a government-sponsored student on a course longer than six months.

A taught master's — the ordinary one-year MSc or MA — does not qualify for any course starting from 1 January 2024 onwards. That is the rule for most students going to the UK.

If someone has told you otherwise, they are describing the rules as they were before 2024. Raise it with your counsellor before anyone makes plans.$$,
   'Dependant rules', 'https://www.gov.uk/student-visa/family-members'),

  (100, 'both', 'After the course: the Graduate route',
   $$The Graduate visa lets you stay and work after finishing, without a job offer. The length is changing.

- Apply on or before 31 December 2026 — two years.
- Apply on or after 1 January 2027 — eighteen months.
- PhD and doctorate graduates — three years, either way.

This matters for planning now. A one-year master's starting this autumn finishes after that date, so it is eighteen months and not two years, whatever an older brochure says.$$,
   'Graduate visa', 'https://www.gov.uk/graduate-visa'),

  (110, 'staff', 'Note for the counsellor',
   $$Five things to get in front of:

1. The 28 days, not the amount. Almost every UK financial refusal is a balance that dipped for one day inside the window, or a statement whose end date fell outside the 31 days. Ask for the statement early and read every line of it, not just the closing balance.
2. Dependants. A taught master's carries no right to bring family for anything starting from 1 January 2024. Families still arrive expecting it because it was true until recently. Say it at the first meeting, not at the CAS stage.
3. The Graduate route drops to eighteen months for applications from 1 January 2027. Anyone starting a one-year master's now lands on the wrong side of that date. Do not let "two years post-study work" be said in a counselling session.
4. ATAS is six weeks minimum and blocks the visa application. Check the CAS for it as soon as it is issued.
5. The TB clinic must be on the Home Office list. Our document checklist says "TB test from IOM", but the requirement is the published list, which is wider than IOM and does change. Point students at the list rather than at a clinic name.

Fees: GBP 558 plus GBP 776 a year of healthcare surcharge, both non-refundable, both paid online at application.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'UK'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
