-- New Zealand's visa page, built from no office records.
--
-- New Zealand has no resident mission in Pakistan — its foreign ministry
-- states that "New Zealand is represented in Pakistan by the New Zealand High
-- Commission to Sri Lanka" — and after Finland that sounds alarming. It is
-- not. The Fee Paying Student Visa is applied for entirely online to
-- Immigration New Zealand, and biometrics are given at VFS Global centres in
-- Pakistan. Nobody has to leave the country. The page says that explicitly,
-- because a student who has heard about Finland will assume the worst.
--
-- Figures are from Immigration New Zealand's own Fee Paying Student Visa page,
-- and two of them correct what is widely repeated:
--
--   * work is up to 25 hours a week during term, not 20. The 20-hour figure is
--     everywhere and is out of date.
--   * INZ publishes 80% within 8 weeks. Aggregator sites quote four and a half
--     weeks, and a student planning on that will be a month short.
--
-- The cost is also understated wherever it is quoted as one number. INZ says
-- "from NZD $850", and the NZD $100 International Visitor Levy is added
-- automatically to a student application on top, so the real figure is nearer
-- 950. The levy is not optional for most students and is easy to miss.
--
-- The health and character thresholds are worth spelling out because they are
-- three different numbers that students conflate: a chest X-ray over six
-- months, a full medical certificate over twelve, and a police certificate at
-- twenty-four months or more.
--
-- Sources: immigration.govt.nz's Fee Paying Student Visa page, mfat.govt.nz on
-- representation in Pakistan, MBIE and INZ on the International Visitor Levy,
-- and VFS Global's own Pakistan-New Zealand portal for the centres.

-- ------------------------------------------------------------- the offices
insert into public.visa_offices
  (destination_id, kind, name, city, jurisdiction, operator, website, appointment_url,
   submits_applications, notes, internal_notes, source_url, verified_at, sort_order)
select d.id, v.kind, v.name, v.city, v.jurisdiction, v.operator, v.website, v.appointment_url,
       v.submits, v.notes, v.internal_notes, v.source_url, now(), v.sort_order
from public.destinations d
cross join (values

  ('visa_centre',
   'VFS Global — New Zealand',
   'Islamabad, Lahore, Karachi',
   null,
   'VFS Global',
   'https://visa.vfsglobal.com/pak/en/nzl/',
   'https://visa.vfsglobal.com/pak/en/nzl/',
   false,
   'Where you give your fingerprints and photograph, here in Pakistan, after applying online to Immigration New Zealand. The application itself is not lodged here — all New Zealand visa applications must now be made online — but this is the in-person step and you do not have to travel abroad for it.',
   'VFS publishes a Pakistan-New Zealand portal with its own per-city centre pages, which is how the three cities are evidenced. Street addresses sit inside the booking flow, which blocks automated requests, so they are not captured here.',
   'https://visa.vfsglobal.com/pak/en/nzl/',
   10),

  ('high_commission',
   'New Zealand High Commission, Colombo (accredited to Pakistan)',
   'Colombo, Sri Lanka',
   'New Zealand has no resident mission in Pakistan. Its foreign ministry states that New Zealand is represented in Pakistan by the High Commission to Sri Lanka, whose service areas include Pakistan, Bangladesh and the Maldives.',
   null,
   'https://www.mfat.govt.nz/en/countries-and-regions/asia/pakistan',
   null,
   false,
   'New Zealand''s accredited mission for Pakistan, in Colombo. It matters for consular questions rather than for your student visa — the visa is applied for online and biometrics are given at VFS here in Pakistan, so there is no reason to contact Colombo or to travel there.',
   'Recorded so the absence of an NZ mission in Pakistan is visible rather than a silent gap — after Finland, staff and students will ask. Confirmed on mfat.govt.nz''s own Pakistan page.',
   'https://www.mfat.govt.nz/en/countries-and-regions/asia/pakistan',
   20)

) as v(kind, name, city, jurisdiction, operator, website, appointment_url, submits, notes, internal_notes, source_url, sort_order)
where d.country_code = 'NZ'
  and not exists (
    select 1 from public.visa_offices x
    where x.destination_id = d.id and x.name = v.name
  );

-- ------------------------------------------------------------- the sections
insert into public.visa_page_sections
  (destination_id, title, body, link_label, link_url, audience, sort_order)
select d.id, s.title, s.body, s.link_label, s.link_url, s.audience, s.sort_order
from public.destinations d
cross join (values

  (10, 'both', 'How it works — and no, you do not have to travel abroad',
   $$What you need is a Fee Paying Student Visa, and the process is one of the simpler ones we handle.

1. Get an Offer of Place from your New Zealand university.
2. Apply online to Immigration New Zealand. All New Zealand visa applications must now be made online — there is no paper route and nothing to hand in over a counter.
3. Give your fingerprints and photograph at a VFS Global centre in Islamabad, Lahore or Karachi.

One thing worth saying plainly: New Zealand has no embassy or high commission in Pakistan, and is represented for consular purposes by its High Commission in Colombo. That does not affect your application. You apply online and your biometrics are taken here in Pakistan — there is no journey to another country in this process.$$,
   'Fee Paying Student Visa', 'https://www.immigration.govt.nz/visas/fee-paying-student-visa/'),

  (20, 'both', 'The money — three things, not one',
   $$You have to show all of these, and they add up:

- Living costs: NZD 20,000 for each year of study if your course runs a year or more, or NZD 1,667 for each month if it is shorter.
- Your tuition fees, paid or covered by a scholarship.
- Your return travel, or enough money to pay for it.

The living costs figure is on top of tuition, not instead of it. A student who shows NZD 20,000 and a paid fee receipt has done it right; one who shows NZD 20,000 covering both has not.

And the trap: you cannot use money you expect to earn from part-time work in New Zealand towards the NZD 20,000. It has to be funded before you go, whatever you intend to do once you are there.$$,
   null, null),

  (30, 'both', 'What it costs — and the levy nobody mentions',
   $$Immigration New Zealand puts the Fee Paying Student Visa at from NZD 850.

On top of that, most students pay the International Visitor Levy of NZD 100. It is added to your application automatically, so you do not apply for it separately — but it does mean the real figure is nearer NZD 950 than 850.

Budget for both, and remember neither is refunded if the application is declined.

Then the separate costs: the medical examination, the police certificate if you need one, and the VFS appointment.$$,
   'Paying the International Visitor Levy', 'https://www.immigration.govt.nz/process-to-apply/applying-for-a-visa/fees-processing-times-and-refunds/paying-the-international-visitor-levy/'),

  (40, 'both', 'Health and character — three different thresholds',
   $$These are three separate rules with three different lengths of stay, and students routinely mix them up.

- Chest X-ray: normally needed if you will be in New Zealand for more than six months.
- Full medical certificate: normally needed if you will be there for more than twelve months.
- Police certificate: needed if you are 17 or older and your total time in New Zealand will be 24 months or longer. It must be less than six months old when you use it.

So a one-year master's normally needs the X-ray and the medical certificate but not the police certificate; a two-year programme needs all three.

Work out your total time in New Zealand, not just the length of the course, because that is what the 24-month rule measures.$$,
   null, null),

  (50, 'both', 'Insurance',
   $$You must agree to hold insurance covering travel and any health care you need, from the day your course starts until your visa expires.

New Zealand leaves the standard to your education provider rather than setting one figure, so what counts as acceptable is your university's rule. Ask them which policies they accept before you buy one — several arrange it for their international students, and taking theirs is usually simpler than proving an outside policy meets their standard.$$,
   null, null),

  (60, 'both', 'How long it takes',
   $$Immigration New Zealand publishes that it decides 80% of Fee Paying Student Visa applications within eight weeks.

Eight weeks is the figure to plan against. You will see four to five weeks quoted on study-abroad sites; that is not what INZ publishes, and a student who plans on it will be a month short.

Count the medical examination and the police certificate before those eight weeks, not inside them. The police certificate in particular has to be less than six months old when it is used, so getting it too early is its own mistake.$$,
   null, null),

  (70, 'both', 'Working while you study',
   $$Up to 25 hours a week during term, and full time during scheduled holidays depending on the conditions printed on your visa.

Twenty-five, not twenty. The 20-hour figure appears in a great deal of older guidance and is out of date — but read the conditions on your own visa rather than assuming, because they are what actually bind you.

As above, none of this can be counted towards the money you have to show to get the visa in the first place.$$,
   null, null),

  (80, 'staff', 'Note for the counsellor',
   $$New Zealand had no office records before this. Five things:

1. No NZ mission in Pakistan, and it does not matter. MFAT confirms New Zealand is represented in Pakistan by its High Commission to Sri Lanka, but the visa is applied for online and biometrics are given at VFS in Islamabad, Lahore or Karachi. After Finland, expect this question — the answer is that New Zealand is the easy case, not another Doha.

2. Twenty-five hours, not twenty. The old figure is still in most circulating material. Correct it when a family quotes it back.

3. Eight weeks, not four and a half. INZ publishes 80% within eight weeks; aggregators say four to five. Plan on INZ's number.

4. The cost is understated everywhere. From NZD 850 plus the NZD 100 International Visitor Levy added automatically — so quote about NZD 950, and say it is non-refundable.

5. The three thresholds are the thing to get right at file-opening: X-ray over six months, medical certificate over twelve, police certificate at twenty-four months or more and less than six months old when used. A one-year master's needs the first two; a two-year programme needs all three. And the 24 months is total time in New Zealand, not course length — a student doing a one-year course then a post-study work visa can cross it.

Also worth knowing: the living-costs figure is on top of tuition and return travel, and intended part-time earnings cannot count towards it.

New Zealand has eight universities in the portal, one tracker field and no scholarship bodies linked. If volume grows it needs proper visa tracker fields.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'NZ'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
