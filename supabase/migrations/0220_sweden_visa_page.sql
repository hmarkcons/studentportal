-- Sweden's visa page.
--
-- Sweden changed substantially on 11 June 2026 and the change is unusually
-- important to get in front of, because it removed something students chose
-- Sweden for. Until then a student residence permit carried no limit on
-- working hours at all. There is now a cap of 15 hours a week during
-- semesters, plus credit-progression requirements, an address-notification
-- duty, and a much harder route from a student permit to a work permit. It
-- applies to anyone who receives a decision on or after 11 June 2026 even if
-- they applied before it, so it reaches students already in the queue. Any
-- guidance written before this summer describes Sweden as it no longer is.
--
-- Two other things shape the page:
--
--   * Tuition is paid before the application, not after. Migrationsverket is
--     explicit: "You must have paid any tuition fees before applying." The
--     institution reports the payment, and only then is the admission final.
--     Same shape as Ireland — real money commits ahead of the decision.
--
--   * Where the in-person step happens is genuinely unclear from Sweden's own
--     pages, and the page says so rather than guessing. Sweden's site states
--     that residence permit applicants instructed to attend for an interview,
--     biometrics or passport check "should not visit or contact the Embassy of
--     Sweden in Bangkok" and refers them to the Migration Agency instead.
--     Third-party immigration firms report that these steps resumed in
--     Pakistan in April 2025 at the Embassy in Islamabad, having previously
--     required a trip to Addis Ababa. That is plausible and encouraging but it
--     is not on a Swedish government page we could read, so the page tells the
--     student to go where the Migration Agency's instruction tells them.
--
-- Note for whoever reads this next: the destination row itself is irregular —
-- display_name "Sweden PB", country_code "SW" where Sweden's ISO code is SE,
-- no universities, and two test agreement templates attached. None of that is
-- touched here. The tracker field for Sweden is keyed on "SW", so changing the
-- country code would orphan it.
--
-- Sources: Migrationsverket's higher-education permit page and its 25 May 2026
-- news item on the new rules; swedenabroad.se for the Embassy's details and
-- the Bangkok instruction.

-- ------------------------------------------------------------- the offices
update public.visa_offices
set address = 'House No. 4, Street No. 5, Sector F-6/3, Islamabad (P.O. Box 1100)',
    phone = '+92 51 207 2680',
    email = 'ambassaden.islamabad-visum@gov.se',
    office_hours = 'Migration section by telephone Mon-Thu 14:00-15:00 only.',
    submits_applications = false,
    notes = 'The study application itself is made to the Swedish Migration Agency, not handed in at an office. This is the migration section to contact, and the number above is answered only between 14:00 and 15:00, Monday to Thursday. When the Migration Agency needs your passport, fingerprints or an interview it will instruct you and tell you where to attend — follow that instruction. Sweden states plainly that residence permit applicants should not contact its Embassy in Bangkok.',
    internal_notes = 'Contact details are from swedenabroad.se. Where the in-person biometrics step physically happens for Pakistan is NOT confirmed on any Swedish government page we could read: Sweden''s own page only says such applicants should not approach the Bangkok embassy and refers them to the Migration Agency. Immigration firms report it resumed at the Islamabad embassy on 9 April 2025 (previously Addis Ababa). Treat the Migration Agency''s instruction as authoritative, and confirm with the migration section before sending a student anywhere.',
    source_url = 'https://www.swedenabroad.se/en/embassies/pakistan-islamabad/',
    verified_at = now()
where name = 'Embassy of Sweden, Islamabad'
  and verified_at is null;

insert into public.visa_offices
  (destination_id, kind, name, city, operator, website,
   submits_applications, notes, internal_notes, source_url, verified_at, sort_order)
select d.id, 'visa_centre', 'VFS Global — Sweden (Schengen visas only)', 'Islamabad',
  'VFS Global',
  'https://www.vfsglobal.com/one-pager/sweden/pakistan/english/',
  false,
  'Handles short-stay Schengen visitor visas for Sweden only, and has done since 7 July 2025 — those applications are forwarded to the Swedish Embassy in Bangkok for decision. A study residence permit is NOT lodged here. Do not book here for your studies.',
  'Listed deliberately rather than omitted: students are told "Sweden uses VFS in Islamabad", which is true for Schengen C and wrong for a study permit. Keeping the row with the scope spelled out is safer than leaving the gap.',
  'https://www.swedenabroad.se/en/about-sweden-non-swedish-citizens/thailand/going-to-sweden/visiting-sweden/temporary-processing-of-visa-applications-for-applicants-residing-in-pakistan/',
  now(),
  20
from public.destinations d
where d.country_code = 'SW'
  and not exists (
    select 1 from public.visa_offices v
    where v.destination_id = d.id and v.name like 'VFS Global — Sweden%'
  );

-- ------------------------------------------------------------- the sections
insert into public.visa_page_sections
  (destination_id, title, body, link_label, link_url, audience, sort_order)
select d.id, s.title, s.body, s.link_label, s.link_url, s.audience, s.sort_order
from public.destinations d
cross join (values

  (10, 'both', 'A residence permit, not a visa',
   $$For a course longer than three months you apply for a residence permit for higher education studies. The decision is the Swedish Migration Agency's.

The application is made to the Migration Agency — online through its e-service, or on paper — from your country of residence. Nothing is handed in over a counter.

Later in the process the Agency asks you to present your passport and give fingerprints and a photograph. Those are used to make your residence permit card, which is what you actually travel and live on.$$,
   'Residence permit for higher education', 'https://www.migrationsverket.se/en/you-want-to-apply/study/higher-education.html'),

  (20, 'both', 'You pay the tuition before you apply',
   $$Sweden puts the money first, and this surprises people.

The Migration Agency's own wording is that you must have paid any tuition fees before applying. You are only treated as finally admitted once the payment is made, and your university reports that to the Agency.

So the sequence is: offer, pay, then apply for the permit. A real sum is committed before anyone knows the outcome.

Ask the university in writing what happens to the fee if the permit is refused, and keep the answer. Swedish institutions have a stated position on this; get it before you transfer anything.$$,
   null, null),

  (30, 'both', 'The money',
   $$You must show at least SEK 10,656 a month if you apply in 2026, covering the whole length of your studies — not a single year.

Bringing family raises it: SEK 4,440 a month for a spouse or partner, and SEK 2,664 a month for each child.

It can come down. If your institution or an exchange organisation gives you free food or housing, the monthly figure is reduced — by SEK 2,960 for food and SEK 4,736 for housing. Get that in writing from the university if it applies to you, because it is a large difference.

The funds can be your own savings, a scholarship, a student grant or loan from Pakistan, a sponsor, or income from employment. The figure is set each year, so confirm the current one before anyone moves money.$$,
   null, null),

  (40, 'both', 'What changed on 11 June 2026',
   $$Sweden used to place no limit at all on how much a student could work. That ended, and the new rules reach people who applied before they came in — they apply to any decision made on or after 11 June 2026.

- Work is capped at 15 hours a week during semesters. There are exceptions for work that is part of your education, and for students who have completed at least two semesters.
- You have to make academic progress: 37.5 credits in your first year, and 45 credits a year from the second year onwards.
- You must tell the Migration Agency your address within 30 days of getting your permit, and again whenever you move.
- Moving from a student permit to a work permit is harder, and generally needs at least two completed semesters behind you.

If you have read anywhere that Sweden lets students work unlimited hours, that was true until this summer and is not true now.$$,
   'New rules for study permits', 'https://www.migrationsverket.se/nyheter/news-archive/2026-05-25-new-rules-for-residence-permits-for-studies-in-higher-education.html'),

  (50, 'both', 'The in-person step, and where not to go',
   $$You do not arrange this yourself. The Migration Agency contacts you when it needs your passport, your fingerprints and photograph, or an interview, and its instruction tells you where to attend. Follow that instruction rather than turning up anywhere on spec.

Two things worth knowing while you wait:

- Sweden says plainly that residence permit applicants should not visit or contact its Embassy in Bangkok, even though Bangkok decides Sweden's short-stay visas for Pakistan. It is not your route.
- Do not book with VFS Global for your studies. VFS in Islamabad handles Sweden's short-stay Schengen visitor visas, which is a different application entirely.

The Embassy's migration section in Islamabad is the right place to ask a question, but its telephone is answered only between 14:00 and 15:00, Monday to Thursday.$$,
   null, null),

  (60, 'both', 'Health insurance',
   $$It depends on how long your course is, and the line is one year.

Less than a year: you need comprehensive health insurance of your own. It has to cover emergency care, hospital treatment, emergency dental care, and being taken home for medical reasons.

A year or more: you register in the Swedish population register once you arrive, which gives you access to the public health system, so private cover is not required for the permit.

Check which side of the line your programme falls on before buying a policy you do not need — or skipping one you do.$$,
   null, null),

  (70, 'both', 'The fee, and how long it takes',
   $$The application fee is SEK 1,500 for an adult, and SEK 750 for a child under 18. It is not refunded if the application is refused.

On timing, the Migration Agency publishes that 75% of recently decided cases were decided within three months.

Three months is the figure to plan against, and it starts from a complete application — which cannot exist until the tuition is paid and reported. Work backwards from the start of term with that whole chain in mind.$$,
   null, null),

  (80, 'staff', 'Note for the counsellor',
   $$Five things:

1. The 11 June 2026 rules are the headline and they cut the other way from most of our news. Sweden's uncapped work right is gone — 15 hours a week during semesters, with exceptions for education-related work and for students past two semesters. Credit progression is now enforced at 37.5 then 45 a year, there is a 30-day address duty, and switching to a work permit generally needs two completed semesters. Crucially it binds anyone decided on or after that date even if they applied earlier, so it affects live cases, not just new ones. Stop quoting "work as much as you like in Sweden".

2. Tuition before the permit application. Migrationsverket will not treat admission as final until the university reports payment, so a family commits real money ahead of the decision. Get the university's refund position in writing first — same discipline as Ireland.

3. SEK 10,656 a month for 2026, for the whole course, not a year. And the reductions are worth chasing: free housing takes SEK 4,736 a month off the requirement and free food SEK 2,960. On a two-year master's that is a very large number, so ask the institution whether either applies before assembling statements.

4. We do not know for certain where the biometrics appointment happens, and the page does not pretend to. Sweden's own site only says these applicants should not approach the Bangkok embassy and refers them to the Migration Agency. Immigration firms report the step resumed at the Islamabad embassy in April 2025, previously Addis Ababa — plausible, not verified on a Swedish government page. Let the Agency's instruction decide, and ring the migration section (Mon-Thu 14:00-15:00) if a student needs certainty.

5. VFS Islamabad is for Schengen visitor visas, not study permits. The row is in the office list with its scope spelled out precisely so nobody books the wrong thing.

Sweden has no universities in the portal and no students registered, so nothing reaches this page yet. It also needs visa tracker fields if it goes live.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'SW'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
