-- Turkey's visa page, built from nothing — there were no office records at all.
--
-- The route is unusually clear once established, and unusually well served.
-- The Turkish Embassy in Islamabad publishes that from 1 May 2021 "Anatolia
-- Travel Services will remain as the sole authorized service provider for
-- Turkish Diplomatic Missions across Pakistan" and that "all sticker visa
-- applications will be submitted and collected via Anatolia Visa Application
-- Centers". There are eight of them — Islamabad, Lahore, Karachi, Peshawar,
-- Sialkot, Gujranwala, Faisalabad and Hyderabad — which is wider coverage
-- than any other destination in the portal.
--
-- Two things the page has to be firm about:
--
--   1. The e-Visa is not a route for study. Turkey's own ministry states the
--      e-Visa "is only valid when the purpose of travel is tourism or
--      commerce" and that other purposes go through an embassy or consulate.
--      Separately, Pakistan sits on Turkey's conditional e-Visa list — open
--      only to holders of a valid Schengen, US, UK or Ireland visa or
--      residence permit. Students see "Turkey e-Visa, three minutes online"
--      and assume it applies to them. It does not.
--
--   2. Time. Anatolia's own guidance is to apply at least a month before
--      travel and that "the standard processing time generally takes around 6
--      weeks at least". It also warns students whose acceptance has a short
--      validity to book early — a slow visa can outlive the acceptance letter,
--      which is the specific way a Turkish case fails.
--
-- The residence permit deadline is widely misreported as "30 days from
-- arrival", including on sites aimed at Pakistani students. METU's own
-- international office is clearer and it is not the same rule: the online
-- e-ikamet application must be made before the visa expires, and the Migration
-- Office "does not process files that are more than thirty days past the
-- student's e-ikamet application date". So the 30 days runs from the online
-- application, not from landing. The page says it the accurate way.
--
-- Sources: the Turkish Embassy Islamabad's announcement on authorised centres,
-- Turkey's Ministry of Foreign Affairs visa information, Anatolia Travel
-- Services' own guidance, METU's international students office, and HEC's
-- degree attestation guidance.

-- ------------------------------------------------------------- the offices
insert into public.visa_offices
  (destination_id, kind, name, city, operator, website, appointment_url,
   submits_applications, notes, internal_notes, source_url, verified_at, sort_order)
select d.id, v.kind, v.name, v.city, v.operator, v.website, v.appointment_url,
       v.submits, v.notes, v.internal_notes, v.source_url, now(), v.sort_order
from public.destinations d
cross join (values

  ('visa_centre',
   'Anatolia Travel Services — Türkiye Visa Application Centre',
   'Islamabad, Lahore, Karachi, Peshawar, Sialkot, Gujranwala, Faisalabad, Hyderabad',
   'Anatolia Travel Services',
   'https://www.anatoliatravelservices.com/en/',
   'https://www.anatoliatravelservices.com/en/',
   true,
   'The only place a Turkish study visa can be lodged in Pakistan. The Turkish Embassy states that Anatolia has been the sole authorised service provider for Turkish missions across Pakistan since 1 May 2021, and that all sticker visa applications are both submitted and collected there. Eight centres. Your biometrics — a facial image and ten fingerprints — are taken at the same appointment.',
   'Confirmed from the Turkish Embassy Islamabad''s own announcement naming Anatolia as sole provider and listing the eight cities. Per-centre street addresses are on Anatolia''s contact page; not captured here because they change as centres are added.',
   'https://islamabad-emb.mfa.gov.tr/Mission/ShowAnnouncement/384014',
   10),

  ('embassy',
   'Embassy of Türkiye, Islamabad',
   'Islamabad',
   null,
   'https://islamabad-emb.mfa.gov.tr/',
   null,
   false,
   'Decides the visa, but does not accept applications. Every sticker visa application goes through an Anatolia centre instead. Türkiye also has consular missions elsewhere in Pakistan, but the submission route is the same wherever you live.',
   'Address and telephone not captured — the mission''s own site was not readable end to end here. Take them from islamabad-emb.mfa.gov.tr when needed. There is also a Consulate General in Karachi, not recorded as a separate row because it does not change where an application is submitted.',
   'https://islamabad-emb.mfa.gov.tr/Mission/ShowAnnouncement/384014',
   20)

) as v(kind, name, city, operator, website, appointment_url, submits, notes, internal_notes, source_url, sort_order)
where d.country_code = 'TR'
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

  (10, 'both', 'The e-Visa is not your route',
   $$You will see that a Turkish e-Visa takes a few minutes online. It is not for you, and this is worth being clear about before anyone pays for one.

Turkey's own ministry states that the e-Visa is valid only when the purpose of travel is tourism or commerce. Study is not either of those, and other purposes go through an embassy or consulate.

On top of that, Pakistan is on Turkey's conditional e-Visa list: the online route is only open to Pakistani nationals who already hold a valid Schengen, United States, United Kingdom or Ireland visa or residence permit.

What you need is a sticker visa for education, applied for in person here, with an acceptance letter from a Turkish university behind it.$$,
   'Turkish visa information', 'https://www.mfa.gov.tr/visa-information-for-foreigners.en.mfa'),

  (20, 'both', 'Where you apply — Anatolia, and only Anatolia',
   $$Turkey has one authorised route in Pakistan and it is not the Embassy.

The Turkish Embassy states that since 1 May 2021 Anatolia Travel Services has been the sole authorised service provider for Turkish missions across Pakistan, and that all sticker visa applications are submitted and collected through Anatolia's centres.

There are eight, which is wider coverage than any other country we deal with: Islamabad, Lahore, Karachi, Peshawar, Sialkot, Gujranwala, Faisalabad and Hyderabad. Use the one nearest you.

Your biometrics are taken at the same appointment — a facial photograph and ten fingerprints — so you attend in person. The Embassy decides the application; the centre only receives it.$$,
   'Anatolia Travel Services', 'https://www.anatoliatravelservices.com/en/'),

  (30, 'both', 'Start early — six weeks at least',
   $$Anatolia's own guidance is to submit at least a month before you travel, and that standard processing generally takes around six weeks at least in working days.

Six weeks is the number to plan against, not a month.

There is a particular trap here. Turkish acceptance letters carry a validity period, and Anatolia specifically warns students whose acceptance is close to expiring to book early. A visa that takes six weeks can outlive an acceptance that had six weeks left on it — and then the visa has nothing valid to attach to.

So check the validity date on your acceptance the day it arrives, and book the appointment from that date rather than from the start of term.$$,
   null, null),

  (40, 'both', 'What to take',
   $$Turkey does not publish a single monthly figure for student funds the way Spain or Italy do, and the document list differs by category. Anatolia publishes a checklist for the education category, and that checklist is the authority — work from it rather than from a general guide.

In outline you should expect to need:

- Passport, with the validity the checklist specifies
- The completed visa application form
- Your acceptance letter from the Turkish university
- Biometric photographs to specification
- Proof that you can fund your studies and living costs
- Proof of accommodation arrangements, where asked for
- Health insurance
- Academic documents, with IBCC attestation for school papers and HEC for degrees
- The visa fee and the centre's service fee, payable at the appointment

Ask the centre what it wants for your case when you book. They handle these constantly and would rather tell you in advance than turn you away on the day.$$,
   null, null),

  (50, 'both', 'After you arrive: the residence permit, and the deadline people get wrong',
   $$The visa gets you in. The residence permit — ikamet — is what lets you stay, and the rule is widely misquoted.

You will read that you must apply within 30 days of arrival. That is not quite it. Two things actually bind:

1. Make the online application at e-ikamet.goc.gov.tr before your visa expires.
2. Once you have made it, your supporting file has to reach the Migration Office within 30 days of that online application. Files older than that are not processed.

So the clock starts when you apply online, not when you land — but the online application itself is bounded by your visa.

Most universities collect and submit the file for you, and often on a fixed schedule — some international offices take documents on one day of the week and send batches fortnightly. Find out your university's schedule in your first week, because it sits inside your 30 days.

Health insurance is required, and you have two options: a private policy covering the whole permit period, or Turkish government insurance through SGK, applied for at a local SGK office with your student certificate. Students are not charged the residence permit fee itself — only the card fee, which was around 964 TL in 2026.$$,
   'e-ikamet', 'https://e-ikamet.goc.gov.tr/'),

  (60, 'both', 'Check HEC will recognise the degree',
   $$Worth settling before you accept an offer rather than after you graduate.

HEC does not attest foreign degrees directly. It issues an equivalence letter against a foreign qualification, and only that letter is then attested. Whether it will issue one depends on the institution and the programme.

Turkey's established state and foundation universities are well recognised, so this is a lower risk here than in some destinations — but lower is not none, and it is free to ask. Put the question to HEC in writing about your specific university and programme, and keep the reply.$$,
   'HEC degree attestation and equivalence', 'https://www.hec.gov.pk/english/services/students/DAS/Pages/Degree-Attestation.aspx'),

  (70, 'staff', 'Note for the counsellor',
   $$Turkey had no office records at all before this. Five things now on record:

1. Anatolia Travel Services is the sole authorised provider and has been since 1 May 2021 — eight cities, and applications are both submitted and collected there. Nothing goes to the Embassy counter. This is our widest-coverage destination, which is genuinely useful for students outside the big three cities.

2. Nobody should be buying a Turkish e-Visa for study. Turkey's ministry limits the e-Visa to tourism and commerce, and Pakistan is on the conditional list anyway. If a student arrives having bought one, it does not convert.

3. Six weeks at least, per Anatolia, and apply a month before travel minimum. The specific failure mode is acceptance-letter validity: Turkish acceptances expire, and a six-week visa can outlast one. Check the validity date the day the acceptance lands and drive the appointment off that, not off term dates.

4. The residence permit deadline is misreported everywhere, including on Pakistani study-abroad sites. It is not "30 days from arrival". The online e-ikamet application must be in before the visa expires, and the file must then reach the Migration Office within 30 days of that online application. Universities usually submit the file on a fixed weekly or fortnightly schedule, which eats into the 30 days — tell students to find their university's schedule in week one.

5. Students pay the card fee only, not the residence permit fee. Around 964 TL in 2026. Health insurance is either a private policy or SGK.

Two gaps worth knowing. Türkiye Bursları, the Turkish government scholarship, is the main funded route to Turkey and is not in our scholarship module at all — Turkey shows no scholarship bodies. And Turkey has fifteen universities in the portal but only one tracker field, so this page is carrying everything.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'TR'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
