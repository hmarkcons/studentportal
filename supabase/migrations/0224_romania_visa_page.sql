-- Romania's visa page, built from no office records.
--
-- Romania's distinctive feature is that the Ministry of Education sits in the
-- middle of the process. A university offer is not enough: the university
-- files the candidate's file with the Ministry's Directorate-General for
-- International Relations and European Affairs, and the Ministry issues a
-- Letter of Acceptance for Studies which it sends both to the university and
-- to the diplomatic mission. Nothing about the visa can start until that
-- letter exists, and the Ministry step alone takes at least 30 days.
--
-- The rest is unusually well documented. An official Romanian government
-- guide (UEFISCDI, an agency of the Ministry of Education) gives hard numbers
-- that most third-party guides get wrong or omit:
--
--   * the legal term for a decision on a D/SD visa is 60 days;
--   * lodge at least 45 days before departure — but NOT earlier than three
--     months before the journey, so it is a window and not just a deadline;
--   * the long-stay visa fee is EUR 120;
--   * the passport must be valid at least three months beyond the visa and
--     must have been issued no more than ten years ago;
--   * the residence permit must be applied for at the General Inspectorate
--     for Immigration within the first 30 days from entry — much tighter than
--     most destinations;
--   * eViza is the only way to obtain an appointment: "there is no other
--     manner in which you can set online appointments for the lodging of visa
--     applications".
--
-- On money, Romania does not publish a figure. Its own conditions-of-entry
-- page states the requirement qualitatively — "sufficient means of
-- subsistence" — and figures of EUR 2,500 to 3,000 circulate on agent sites
-- that could not be traced to any Romanian government source. The page says
-- so rather than repeating them, and points at the eViza checklist instead.
--
-- Romania has no universities in the portal, so nothing reaches this page yet.
-- Its government scholarship is already linked in the scholarship module.

-- ------------------------------------------------------------- the office
-- verified_at left null deliberately: the route is confirmed from Romanian
-- government sources, but the Embassy's own site (islamabad.mae.ro) returned
-- 503 throughout, so the street address could not be read at source.
insert into public.visa_offices
  (destination_id, kind, name, city, address, website, appointment_url,
   submits_applications, notes, internal_notes, source_url, sort_order)
select d.id, 'embassy', 'Embassy of Romania, Islamabad', 'Islamabad',
  'Diplomatic Enclave, Sector G-5/4, Islamabad',
  'https://islamabad.mae.ro/en',
  'https://evisa.mae.ro/',
  true,
  'Where the visa application is physically lodged and your biometrics are taken, after you have filed it electronically on the eViza portal. There is no visa application centre for Romania in Pakistan and no other way to get an appointment — eViza is the only route to one. The Ministry of Education sends your Letter of Acceptance here directly.',
  'Route confirmed from an official Romanian government guide (UEFISCDI): applications are lodged electronically via eViza and physically at the competent mission, and eViza is the sole appointment channel. The address here is from directory listings — islamabad.mae.ro returned 503 on every attempt, so it could not be read at source. Confirm by telephone, then tick confirmed.',
  'https://uefiscdi.gov.ro/resource-823775',
  10
from public.destinations d
where d.country_code = 'RO'
  and not exists (
    select 1 from public.visa_offices v
    where v.destination_id = d.id and v.name = 'Embassy of Romania, Islamabad'
  );

-- ------------------------------------------------------------- the sections
insert into public.visa_page_sections
  (destination_id, title, body, link_label, link_url, audience, sort_order)
select d.id, s.title, s.body, s.link_label, s.link_url, s.audience, s.sort_order
from public.destinations d
cross join (values

  (10, 'both', 'The Ministry of Education sits in the middle',
   $$A Romanian university offer is not enough on its own, and this is the part that surprises people.

1. The university accepts you.
2. The university then files your application with the Ministry of Education — its Directorate-General for International Relations and European Affairs. You do not do this yourself.
3. If the Ministry agrees, it issues a Letter of Acceptance for Studies and sends it to the university and directly to the Romanian diplomatic mission.
4. Only then can you apply for the long-stay study visa, marked D/SD.

Allow at least 30 days for the Ministry step, and plan for longer — published figures vary and it is outside both your control and the university's.

Some universities also ask you to confirm your place within a short window by paying a year's tuition in advance. Ask yours what its rule is, because that money moves before the visa does.$$,
   null, null),

  (20, 'both', 'The visa: eViza first, then the Embassy',
   $$You file the application electronically through Romania's eViza portal, and then lodge it physically at the Embassy of Romania in Islamabad, where your biometrics are taken.

eViza matters for a reason beyond the form. Romania's own guidance is blunt about it: there is no other way to set an appointment for lodging a visa application. No telephone, no email, no walking in. If you have not been through eViza you have no appointment.

There is no visa application centre for Romania in Pakistan — no VFS, no third party. The Embassy handles it directly.

The long-stay visa fee is EUR 120, or the equivalent in convertible currency.

Lodging an application does not mean the visa will be issued; Romania says so explicitly.$$,
   'eViza portal', 'https://evisa.mae.ro/'),

  (30, 'both', 'The timing window — 45 days, but not more than three months',
   $$Romania gives itself a legal term of 60 days to decide a D/SD application. That is the number to plan against.

Its guidance recommends lodging at least 45 days before your estimated departure — and not earlier than three months before the journey.

So this is a window rather than a deadline. Too late and the visa cannot arrive in time; too early and the application will not be accepted. Aim for somewhere between three months and 45 days before you intend to travel.

Count backwards properly: the Ministry's Letter of Acceptance takes at least 30 days and has to exist before any of this starts.$$,
   null, null),

  (40, 'both', 'Two rules about your passport',
   $$Easy to overlook and both are absolute.

Its validity must exceed the validity of the visa you are applying for by at least three months.

And it must have been issued no more than ten years ago. An older passport is not accepted even if it has not expired.

Check both before you book an appointment. Renewing a passport at the wrong moment can cost you the window described above.$$,
   null, null),

  (50, 'both', 'Money: what Romania actually says',
   $$Romania requires that you have sufficient means of subsistence for your stay and for your return journey. That is how its own conditions of entry put it — as a test, not as a number.

Romania does not publish a monthly or annual figure in that guidance the way Spain, Italy or Finland do.

You will find figures quoted online — sums around EUR 2,500 to 3,000 are common on agency websites. We could not trace those to any Romanian government source, so do not treat them as the requirement and do not arrange your finances solely around them.

What to do instead: work from the document checklist for the D/SD category on eViza, and ask the Embassy's consular section what it expects to see. Then show comfortably more than the minimum rather than exactly it.$$,
   null, null),

  (60, 'both', 'After you arrive: 30 days, not three months',
   $$The D/SD visa does not by itself cover a full course. It gets you in, and a residence permit extends your stay beyond the 90-day limit.

You must apply for it within the first 30 days from the date you enter Romania, at the territorial bureau of the General Inspectorate for Immigration.

Thirty days is short, and shorter than most of our other destinations allow. Find out which territorial bureau covers your university's city before you fly, and ask the university's international office how it usually handles this — most walk their students through it, but not all do it in your first month unless you ask.$$,
   'General Inspectorate for Immigration', 'https://igi.mai.gov.ro/en'),

  (70, 'staff', 'Note for the counsellor',
   $$Romania had no office records at all before this. What is now established:

1. The Ministry of Education step is the one that breaks timelines. The university files with the Ministry's DGRIAE, the Ministry issues the Letter of Acceptance for Studies and sends it to the university and to the mission. Minimum 30 days, and published figures vary. Nothing about the visa exists until it does, so build the case calendar backwards from it, not from term dates.

2. eViza is the only appointment channel — Romania's own words. If a student says they cannot get an appointment, the question is whether they completed eViza, not whether we can ring the Embassy.

3. The timing is a window, not a deadline: decide in 60 days by law, lodge at least 45 days before departure, and not earlier than three months before. Applying too early is also a failure mode, which is unusual and worth knowing.

4. Passport rules catch people: validity must exceed the visa by three months, and the passport must have been issued within the last ten years. Check both at the file-opening stage.

5. Residence permit within 30 days of entry at the IGI territorial bureau. That is tighter than Luxembourg's three months or Turkey's arrangement, and students treat arrival as the finish line.

On money, do not quote the EUR 2,500 to 3,000 figures that circulate — we could not trace them to a Romanian source, and Romania states the requirement qualitatively. Use the eViza D/SD checklist and the consular section.

Two gaps. Romania has no universities in the portal at all, so no student can reach this page yet, and it has one tracker field. The Romanian Government Scholarships body is already linked in the scholarship module, which is the main funded route.

The Embassy row is deliberately left unconfirmed: the route is from Romanian government sources, but islamabad.mae.ro returned 503 on every attempt so the street address came from directory listings. Ring them and tick it.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'RO'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
