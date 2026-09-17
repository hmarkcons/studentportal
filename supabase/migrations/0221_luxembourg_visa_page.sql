-- Luxembourg's visa page, and the answer to the question 0199 left open.
--
-- 0199 recorded that Luxembourg has no mission in Pakistan and that "which
-- Schengen partner represents it for visas" was still to be confirmed. It is
-- Belgium. Luxembourg's own guidance is that long-stay applications "are
-- always processed by a Luxembourg or Belgian diplomatic or consular post",
-- and the Belgian Embassy in Islamabad publishes a page headed "visa for
-- Belgium and Grand Duchy of Luxembourg". Two further specifics from that
-- page, both of which matter:
--
--   * applications "can exclusively be processed through VFS/Gerry's" — not at
--     the embassy counter, for short-stay or long-stay;
--   * from 1 July 2026 a D visa carries a EUR 250 handling fee.
--
-- Luxembourg is also the only destination here with a two-stage permission
-- that both happens before departure. You write to the General Department of
-- Immigration for a temporary authorisation to stay, and only once that is
-- granted — it is valid 90 days — do you apply for the type D visa. Nothing
-- can be done on arrival.
--
-- Note a correction: the office record named the Ministry of Foreign and
-- European Affairs. The authorisation is handled by the General Department of
-- Immigration, which sits under the Ministry of Home Affairs. Renamed.
--
-- The money is expressed as a percentage rather than a figure — at least 80%
-- of the social inclusion income. On the rate in force since 1 June 2026
-- (EUR 972.20 a month for a single adult, per the National Solidarity Fund)
-- that works out around EUR 778 a month. The page shows the working and says
-- to confirm, because the rate is index-linked and moves.
--
-- Sources: guichet.public.lu on student residence conditions, the Belgian
-- Embassy Islamabad's Belgium-and-Luxembourg visa page, and fns.public.lu for
-- the REVIS amount.

-- ------------------------------------------------------------- the offices
update public.visa_offices
set name = 'Luxembourg — General Department of Immigration (Ministry of Home Affairs)',
    city = 'Luxembourg (applied to by post from Pakistan)',
    submits_applications = false,
    notes = 'This is where the first step goes: the application for a temporary authorisation to stay, sent from Pakistan before you travel. It is not a place you visit and it is not where the visa is issued. Once the authorisation is granted, the type D visa is applied for through VFS/Gerry''s — see below.',
    internal_notes = 'Renamed: the authorisation is handled by the General Department of Immigration under the Ministry of Home Affairs, not the Ministry of Foreign and European Affairs as this row previously said. Belgium is confirmed as the representing partner for long-stay applications.',
    website = 'https://guichet.public.lu/en/citoyens/immigration/plus-3-mois/ressortissant-tiers/etudiant/etudiant-pays-tiers.html',
    source_url = 'https://guichet.public.lu/en/citoyens/immigration/plus-3-mois/ressortissant-tiers/etudiant/etudiant-pays-tiers.html',
    verified_at = now()
where name = 'Luxembourg — Ministry of Foreign and European Affairs'
  and internal_notes = 'Which Schengen partner represents Luxembourg for visas still to be confirmed.';

insert into public.visa_offices
  (destination_id, kind, name, city, operator, website, appointment_url,
   submits_applications, notes, internal_notes, source_url, verified_at, sort_order)
select d.id, v.kind, v.name, v.city, v.operator, v.website, v.appointment_url,
       v.submits, v.notes, v.internal_notes, v.source_url, now(), v.sort_order
from public.destinations d
cross join (values

  ('visa_centre',
   'VFS Global / Gerry''s — Belgium and Luxembourg',
   'Islamabad',
   'VFS Global / Gerry''s',
   'https://visa.vfsglobal.com/pak/en/bel/',
   'https://visa.vfsglobal.com/pak/en/bel/',
   true,
   'Where the type D visa application is handed in, once Luxembourg has granted your temporary authorisation to stay. The Belgian Embassy states that applications for both short-stay and long-stay visas can exclusively be processed through VFS/Gerry''s — not at the embassy itself. From 1 July 2026 a D visa carries a EUR 250 handling fee, paid on submission.',
   'Confirmed from the Belgian Embassy Islamabad''s own "visa for Belgium and Grand Duchy of Luxembourg" page. Per-city addresses sit inside the VFS booking flow, which blocks automated requests, so they are not captured here.',
   'https://pakistan.diplomatie.belgium.be/en/travel-belgium/visa-belgium-and-grand-duchy-luxembourg',
   10),

  ('embassy',
   'Embassy of Belgium, Islamabad (acting for Luxembourg)',
   'Islamabad',
   null,
   'https://pakistan.diplomatie.belgium.be/en',
   null,
   false,
   'Luxembourg has no mission in Pakistan, and Belgium handles its long-stay visa applications. The Embassy decides the application but does not accept it over the counter — that goes to VFS/Gerry''s. The Embassy also states plainly that it does not work with travel agents or consultants on visa applications.',
   'Address deliberately not recorded: the Embassy''s own page warns that information about it found through search engines is not reliable and directs people to its official site. Take the address from there at the time of use rather than from this row.',
   'https://pakistan.diplomatie.belgium.be/en/travel-belgium/visa-belgium-and-grand-duchy-luxembourg',
   20)

) as v(kind, name, city, operator, website, appointment_url, submits, notes, internal_notes, source_url, sort_order)
where d.country_code = 'LU'
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

  (10, 'both', 'Two permissions, and both before you fly',
   $$Luxembourg is a two-stage process and neither stage can be done after you arrive.

1. A temporary authorisation to stay. You apply for this from Pakistan to Luxembourg's General Department of Immigration, before anything else. If it is granted it comes back by post and is valid for 90 days.
2. A type D visa. Only once you hold the authorisation do you apply for the visa — and because Luxembourg has no mission in Pakistan, that goes through Belgium.

The authorisation has to be applied for and approved before you enter the country. There is no version of this where you travel first and sort it out there.

The 90-day validity is the clock that matters: the visa has to be obtained and the journey made inside it.$$,
   'Luxembourg student residence conditions', 'https://guichet.public.lu/en/citoyens/immigration/plus-3-mois/ressortissant-tiers/etudiant/etudiant-pays-tiers.html'),

  (20, 'both', 'Belgium handles the visa, and VFS takes it in',
   $$Luxembourg has no embassy or consulate in Pakistan. Belgium represents it — Luxembourg's own guidance is that long-stay applications are always processed by a Luxembourg or Belgian post.

In Pakistan that means the Belgian Embassy in Islamabad decides your visa, but it does not take the application at its counter. Its own page says applications for both short-stay and long-stay visas can exclusively be processed through VFS/Gerry's. So you book and submit there.

Since 1 July 2026 a D visa carries a EUR 250 handling fee, payable when you submit.

One thing the Belgian Embassy states plainly: it does not work with travel agents or consultants on visa applications. Your application is yours — submitted under your own name, with your own contact details. Your counsellor prepares you for it and cannot stand in for you at it.$$,
   'VFS Global — Belgium and Luxembourg', 'https://visa.vfsglobal.com/pak/en/bel/'),

  (30, 'both', 'What the authorisation application needs',
   $$Sent to the General Department of Immigration from Pakistan:

- A copy of your passport — the whole document, not just the photo page
- A criminal record extract, or a sworn affidavit where one cannot be obtained
- Proof that you are enrolled at a Luxembourg higher education institution
- Proof of sufficient resources — see below
- A health insurance certificate
- Parental authorisation, if you are under 18

The enrolment proof is the part that depends on the university having accepted your qualification, and Luxembourg assesses foreign diplomas before admission. Your tracker follows that separately as diploma equivalence — settle it with the university early, because the authorisation cannot be applied for without the enrolment behind it.

Documents not in French, German or English generally need a translation; ask the Department what it wants for your particular papers.$$,
   null, null),

  (40, 'both', 'The money',
   $$Luxembourg sets this as a proportion rather than a fixed sum: you must show monthly resources of at least 80% of the social inclusion income.

On the rate in force since 1 June 2026 — EUR 972.20 a month for a single adult — that is roughly EUR 778 a month. The underlying rate is index-linked and moves, so treat that as the working rather than the number, and confirm the current figure before anyone transfers anything.

It can be shown as a scholarship, as bank statements in your own name, or through somebody undertaking to support you. A scholarship award is the cleanest of the three because it answers the amount and the duration at once.$$,
   null, null),

  (50, 'both', 'After you arrive: three days, then three months',
   $$Two deadlines, and the first is very short.

Within three days of arriving, make a declaration of arrival at the commune where you are living. Three days, not three weeks — so know which commune it is and what it needs before you land.

Then, within three months of arriving, apply for your residence permit. Between the two you will be called for a medical examination, which includes tuberculosis screening.

The 90-day authorisation gets you in; the residence permit is what lets you stay. Do not treat landing as the end of the process.$$,
   null, null),

  (60, 'staff', 'Note for the counsellor',
   $$Five things:

1. The representation question is answered: Belgium. Luxembourg's guidance is that long-stay applications always go to a Luxembourg or Belgian post, and the Belgian Embassy Islamabad publishes a combined Belgium-and-Luxembourg visa page. Our office record used to say this was unconfirmed; it is now recorded.

2. Nothing is lodged at the Belgian Embassy. Short-stay and long-stay both go exclusively through VFS/Gerry's, and a D visa costs EUR 250 in handling from 1 July 2026 on top of the visa fee itself. Budget it.

3. The Belgian Embassy says it does not work with travel agents or consultants on visa applications. Worth knowing before somebody rings them on a student's behalf and gets nowhere. Prepare the student to submit and attend themselves.

4. The authorisation comes first and it is not quick. It goes to the General Department of Immigration by post from Pakistan, and only when it is granted — valid 90 days — can the visa be applied for. The 90 days then has to absorb the VFS appointment, the decision and the flight, so a slow visa step can burn the authorisation. Sequence it deliberately and do not let the enrolment or the criminal record extract be the thing everyone waits on.

5. The money is 80% of the social inclusion income, not a published figure. About EUR 778 a month on the rate since 1 June 2026, but it is index-linked — re-derive it rather than quoting this page in a year.

We also corrected the ministry on the office record: immigration sits under the Ministry of Home Affairs, not Foreign and European Affairs.

Luxembourg has one university in the portal and no students registered, and only two visa tracker fields. If it goes live it needs more.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'LU'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
