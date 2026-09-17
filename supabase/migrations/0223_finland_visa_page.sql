-- Finland's visa page.
--
-- Finland needs saying before anything else: as of 16 June 2026 the Embassy of
-- Finland in Islamabad is closed. Finland's own foreign ministry lists it as
-- closed, and for consular, passport and residence permit matters Pakistani
-- applicants are now served by the Embassy of Finland in Doha. For visa
-- matters — a different thing from a residence permit — Finland is represented
-- by the Netherlands.
--
-- That matters because the residence permit process has a compulsory in-person
-- step: after applying online in Enter Finland you must attend a Finnish
-- mission to prove identity and give fingerprints. With Islamabad closed, for
-- a Pakistani student that mission is in Doha.
--
-- And Doha became harder to reach on 31 March 2026, when Qatar suspended
-- visa-on-arrival for Pakistani nationals with immediate effect. A Pakistani
-- national now needs a Qatari visa obtained in advance before they can travel
-- to give Finnish biometrics. So a Finland case now contains a second
-- country's visa application inside it, with its own cost and its own risk of
-- not coming through in time.
--
-- This is not a detail to leave in a staff note. A family can commit tuition
-- and application fees and then find the biometrics step out of reach, so the
-- page leads with it and tells them to talk to their counsellor before paying
-- anything. Whether Finland remains a destination we should be selling is a
-- business judgement, not something a migration can make — but nobody should
-- be making it without this in front of them.
--
-- The insurance rule is the other thing worth getting right, because Finnish
-- universities name insufficient cover as a common cause of delay, and the two
-- figures look contradictory until the reason is explained: under two years you
-- need medical cover of at least EUR 120,000 because you get no municipal
-- healthcare; at two years or more you become a municipal resident and need
-- EUR 40,000 of medicine cover instead.
--
-- Sources: Finland's foreign ministry and finlandabroad.fi for the closure and
-- the Doha/Netherlands split; EY and Khaleej Times for the Qatari suspension;
-- Migri via the University of Helsinki's and Aalto's student instructions for
-- the permit requirements.

-- ------------------------------------------------------------- the offices
insert into public.visa_offices
  (destination_id, kind, name, city, jurisdiction, website,
   submits_applications, notes, internal_notes, source_url, verified_at, sort_order, status)
select d.id, v.kind, v.name, v.city, v.jurisdiction, v.website,
       v.submits, v.notes, v.internal_notes, v.source_url, now(), v.sort_order, v.status
from public.destinations d
cross join (values

  ('embassy',
   'Embassy of Finland, Doha',
   'Doha, Qatar',
   'Serves Pakistan for consular, passport and residence permit matters since the Islamabad embassy closed on 16 June 2026.',
   'https://finlandabroad.fi/web/qat/frontpage',
   false,
   'Where a Pakistani applicant now proves their identity and gives fingerprints for a Finnish residence permit, because the Islamabad embassy has closed. The application itself is made online in Enter Finland; this is the in-person step. Travelling there needs a Qatari visa obtained in advance — Qatar suspended visa-on-arrival for Pakistani nationals on 31 March 2026 — so treat it as a journey to plan and budget for, not a formality.',
   'Doha confirmed as the serving mission for Pakistan from Finland''s own listings. finlandabroad.fi returns 403 to automated requests so the page could not be read end to end; re-check before sending a student, and check whether Finland has since opened a VFS route for Pakistan, which would change this entirely.',
   'https://um.fi/finland-s-representation-abroad-by-country/-/asset_publisher/dCMOY7lDMXLf/contactInfoOrganization/id/73835850',
   10,
   'active'),

  ('embassy',
   'Embassy of Finland, Islamabad — CLOSED since 16 June 2026',
   'Islamabad',
   null,
   'https://finlandabroad.fi/web/pak/mission',
   false,
   'Closed on 16 June 2026 and no longer provides any service. Do not travel to it and do not try to book an appointment there. Residence permit and consular matters are handled by the Embassy of Finland in Doha; for visas — which is not what a student needs — Finland is represented by the Netherlands.',
   'Kept in the list deliberately rather than omitted: students and older guides still refer to an embassy in Islamabad, and a row saying it is closed is more useful than its absence.',
   'https://finlandabroad.fi/web/pak/mission',
   20,
   'active')

) as v(kind, name, city, jurisdiction, website, submits, notes, internal_notes, source_url, sort_order, status)
where d.country_code = 'FI'
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

  (10, 'both', 'Read this first: the Islamabad embassy has closed',
   $$Finland closed its Embassy in Islamabad on 16 June 2026. This changes the practical position for a Pakistani student and you need to understand it before committing any money.

Applying for the residence permit is online and unaffected. But there is a compulsory in-person step — proving your identity and giving fingerprints at a Finnish mission — and with Islamabad closed, the mission that serves Pakistan for residence permit matters is the Embassy of Finland in Doha.

Getting to Doha is now its own problem. On 31 March 2026 Qatar suspended visa-on-arrival for Pakistani nationals, so you need a Qatari visa obtained in advance before you can travel to give your Finnish biometrics.

So a Finland application now has a second country's visa inside it, with its own cost, its own paperwork and its own chance of not arriving in time.

Talk this through with your counsellor before you pay a tuition deposit or an application fee. It is not a reason Finland is impossible — but it is a real obstacle and it should be a decision, not a surprise.$$,
   null, null),

  (20, 'both', 'What you are applying for',
   $$A residence permit for studies, not a visa. The distinction matters here more than usual.

1. Apply online through Enter Finland, the Finnish Immigration Service's own service.
2. Attend in person to prove your identity with your passport and give your fingerprints and photograph — for Pakistan, in Doha.
3. The permit is granted for two years unless you ask for a shorter period, and it can cover the whole length of the degree.

One thing not to get confused by: Finland is represented by the Netherlands for visa matters. That is short-stay visas, not your residence permit. Do not go to the Dutch embassy for your student biometrics.$$,
   'Enter Finland', 'https://enterfinland.fi/'),

  (30, 'both', 'The money',
   $$You need at least EUR 800 a month at your disposal for accommodation, food and everything else.

If your studies last a year or more, that means having EUR 9,600 in your account at the moment you submit the application — not a promise of it later, and not spread over the year.

One rule catches people out: when you apply for your first residence permit, you cannot use work to meet the income requirement. A part-time job you intend to find in Finland does not count towards the EUR 9,600, however realistic it is.

A scholarship counts, and Finland has scholarship routes worth asking your counsellor about before assembling bank statements.$$,
   null, null),

  (40, 'both', 'The insurance rule — and why the two figures differ',
   $$Finnish universities name insufficient insurance cover as one of the commonest reasons a residence permit application is delayed, so read this carefully.

Which figure applies depends on how long your studies last:

- Under two years: your insurance must cover medical expenses of at least EUR 120,000.
- Two years or more: your insurance must cover medicine expenses of at least EUR 40,000.

The difference is not arbitrary. On a course of two years or more you are registered as a municipal resident in Finland and get access to public healthcare, so you only need cover for medicines. On a shorter course you do not, so you need full medical cover.

Check which side of two years your programme falls on before you buy a policy, and check the policy wording against the figure rather than trusting a broker's summary.$$,
   null, null),

  (50, 'both', 'Fees, and how long it takes',
   $$The first residence permit application costs around EUR 350 when made online through Enter Finland.

Migri works to a statutory maximum of 90 days for student applications, and universities warn that it can run longer than that in practice.

Budget for more than the permit fee, though. On top of it, for a Pakistani applicant right now, sit the Qatari visa, the flights to Doha and the time that whole detour takes. Work backwards from the start of term with all of it counted, not just the ninety days.$$,
   null, null),

  (60, 'both', 'What to have ready',
   $$- Passport, valid well beyond the permit you are asking for
- Your letter of admission from the Finnish university
- Proof of the EUR 9,600, or EUR 800 a month for a shorter course
- Proof that tuition has been paid, where your programme charges it
- An insurance policy meeting the figure that applies to your course length
- Academic documents, with IBCC attestation for school papers and HEC for degrees
- Passport photographs to specification

Take originals to the in-person appointment — the whole point of it is that somebody checks the documents against you.$$,
   null, null),

  (70, 'both', 'Working while you study',
   $$Once you hold the permit you may work an average of 30 hours a week during your studies, and there is no separate work permit to apply for.

Two things to keep straight. It is an average across the year rather than a weekly ceiling, so a busy fortnight is not automatically a breach. And it cannot be used to satisfy the money requirement for your first permit — that has to be funded before you arrive.

After you finish, Finland has a residence permit for looking for work, applied for from inside the country.$$,
   null, null),

  (80, 'staff', 'Note for the counsellor',
   $$Finland needs a decision from the business before it needs more counselling material.

The Embassy in Islamabad closed on 16 June 2026. Residence permit and consular matters for Pakistan moved to the Embassy of Finland in Doha; for visas, Finland is represented by the Netherlands. The residence permit process has a compulsory in-person identity and fingerprint step, so for our students that step is now in Doha.

And Qatar suspended visa-on-arrival for Pakistani nationals on 31 March 2026, so reaching Doha needs a Qatari visa obtained in advance. A Finland case therefore contains a second country's visa application, and a student can be fully admitted, fully funded and still unable to complete biometrics.

Three consequences for how we handle Finland:

1. Do not take a tuition deposit or a service fee on a Finland case without the student understanding the Doha step and the Qatari visa in front of it. Put it in writing.
2. Re-check the position before every new case. Finland may open a VFS route for Pakistan, which is how several countries handle exactly this situation and would remove the whole problem. Our office record for Doha says to check this.
3. If Finland stays on our list, the Qatari visa needs to be a tracked step in its own right. At present Finland has one tracker field.

On the permit itself, the two things that actually get applications delayed are the insurance figure and the money. Insurance is EUR 120,000 of medical cover under two years, EUR 40,000 of medicine cover at two years or more — universities cite wrong cover as a common delay. Money is EUR 9,600 in the account at submission for a course of a year or more, and a first-permit applicant may not count intended work towards it.

EUR 350 online, 90-day statutory maximum, often longer. Finland has thirteen universities in the portal and two scholarship bodies already linked.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'FI'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
