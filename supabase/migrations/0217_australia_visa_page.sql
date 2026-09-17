-- Australia's visa page, and the centre details 0199 left open.
--
-- Australia is the first destination we have built where there is nowhere to
-- lodge anything. The subclass 500 is filed online in ImmiAccount from start
-- to finish; the only reason to visit a counter is biometrics, and even that
-- needs no appointment. The High Commission takes no applications and says
-- plainly on its own site not to ring it about visas. So the page leads with
-- "there is no queue to join" rather than with an address.
--
-- Three things are recent or widely got wrong:
--
--   1. The fee. AUD 1,600 until July 2025, then 2,000, and AUD 2,500 since
--      1 July 2026 — the highest it has ever been, and non-refundable. Guides
--      written a year ago are out by nine hundred dollars.
--
--   2. The Genuine Student requirement replaced the Genuine Temporary Entrant
--      test on 23 March 2024, and it inverted the argument. GTE asked a
--      student to show they intended to leave. GS asks whether the commitment
--      to study is genuine, and the policy explicitly contemplates students
--      going on to skilled migration. Advising a student to write "I will
--      return home" is now answering a question nobody asked.
--
--   3. Biometrics need no appointment in Pakistan. Walk in with the letter.
--
-- Sources: studyaustralia.gov.au and the Australian High Commission Islamabad's
-- own visas page for the process and contact details, Home Affairs policy for
-- the Genuine Student requirement, VFS Global for the biometric centres.

-- ------------------------------------------------------------- the offices
update public.visa_offices
set address = 'Constitution Avenue and Ispahani Road, Diplomatic Enclave No. 1, Sector G-5/4, Islamabad',
    phone = '+92 51 835 5500',
    submits_applications = false,
    notes = 'No visa application is lodged here and the High Commission does not answer visa enquiries — its own site asks people not to telephone about visas. Everything is filed online in ImmiAccount. For questions, the Department of Home Affairs Global Service Centre is +61 2 6196 0196.',
    internal_notes = null,
    source_url = 'https://pakistan.embassy.gov.au/islm/visas_and_migration.html',
    verified_at = now()
where name = 'Australian High Commission, Islamabad'
  and internal_notes = 'Centre details to be confirmed.';

insert into public.visa_offices
  (destination_id, kind, name, city, operator, website,
   submits_applications, notes, internal_notes, source_url, verified_at, sort_order)
select d.id, 'visa_centre', 'Australia Biometrics Collection Centre', 'Islamabad, Lahore, Karachi',
  'VFS Global',
  'https://visa.vfsglobal.com/pak/en/aus/biometric-collection',
  -- Biometrics only. The application itself is online, so nothing is
  -- "submitted" here and the page should not imply a lodgement queue.
  false,
  'Fingerprints and a digital photograph, after you have applied online. You do not need an appointment — bring your passport, photographic ID and the biometrics letter Home Affairs issues you. Centres are in Islamabad, Lahore and Karachi; staff speak Urdu and English.',
  'Cities confirmed from VFS and the High Commission''s page. Street addresses are only on the VFS site, which blocks automated requests, so they are not captured here — the centre finder on the VFS link gives them.',
  'https://pakistan.embassy.gov.au/islm/visas_and_migration.html',
  now(),
  10
from public.destinations d
where d.country_code = 'AU'
  and not exists (
    select 1 from public.visa_offices v
    where v.destination_id = d.id and v.name = 'Australia Biometrics Collection Centre'
  );

-- ------------------------------------------------------------- the sections
insert into public.visa_page_sections
  (destination_id, title, body, link_label, link_url, audience, sort_order)
select d.id, s.title, s.body, s.link_label, s.link_url, s.audience, s.sort_order
from public.destinations d
cross join (values

  (10, 'both', 'It is all online — there is no queue to join',
   $$Australia's student visa is the subclass 500, and it is filed online from start to finish.

1. Get your Confirmation of Enrolment (CoE) from the university. The course has to be on CRICOS, Australia's register of courses approved for international students. No CoE, no application.
2. Create an ImmiAccount and lodge the application there, with the documents uploaded.
3. Home Affairs then writes to you asking for biometrics. You take that letter to a collection centre.

Nothing is handed in at the Australian High Commission. It does not accept applications and its own site asks people not to telephone it about visas — for questions the Department of Home Affairs Global Service Centre is +61 2 6196 0196.$$,
   'Student visa (subclass 500)', 'https://www.studyaustralia.gov.au/en/plan-your-move/your-guide-to-visas/student-visa-subclass-500'),

  (20, 'both', 'Biometrics: no appointment needed',
   $$Once Home Affairs sends you the biometrics letter, go to a collection centre in Islamabad, Lahore or Karachi.

You do not need to book. Take three things: your passport, photographic identification, and the biometrics letter itself. Fingerprints and a digital photograph are taken and that is the whole visit.

Do not go before the letter arrives — there is nothing for them to attach the biometrics to.$$,
   'Find a collection centre', 'https://visa.vfsglobal.com/pak/en/aus/biometric-collection'),

  (30, 'both', 'The Genuine Student requirement',
   $$This is the part of the application that is written rather than uploaded, and it changed on 23 March 2024.

You answer four questions in the online form, in English, up to 150 words each: your current circumstances and ties at home, why this course, why this provider, and what you understand about the course and about living in Australia.

The change matters. The old test — Genuine Temporary Entrant — effectively asked you to show you would leave Australia afterwards. The Genuine Student requirement asks something different: whether your commitment to studying is real. Policy now openly accepts that a graduate may go on to skilled migration.

So do not write an essay promising to return home. Answer what is asked: why this course, why this provider, how it follows from what you have already done. Specific and true beats polished.$$,
   'Genuine Student requirement', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500/genuine-student-requirement'),

  (40, 'both', 'The money',
   $$Three things together, not one:

- Living costs — AUD 29,710 for twelve months, for you alone.
- Your first year's tuition, as the CoE states it.
- The return airfare.

Bringing family adds to it: about AUD 10,394 for a partner, AUD 4,449 for each child, and AUD 13,502 a year per school-age child for schooling.

The test is not only the total. The funds have to be genuinely available to you, and a balance that appears days before you apply reads as borrowed for the application. Hold the money, and be able to show where it came from — which is what the property valuation and wealth certificates on your checklist are for.

These figures are reviewed by the Department. Confirm the current amount before a family moves anything.$$,
   null, null),

  (50, 'both', 'What it costs',
   $$The visa application charge is AUD 2,500 for the main applicant, and it is not refunded if the application is refused.

That figure has moved twice recently: AUD 1,600 until July 2025, AUD 2,000 from then, and AUD 2,500 since 1 July 2026. It is the highest it has ever been, and any guide written before this July understates it. Additional applicants are charged separately.

On top of that: Overseas Student Health Cover, the medical examination, the police certificate, and the biometrics visit.$$,
   null, null),

  (60, 'both', 'Health cover, health checks and character',
   $$Overseas Student Health Cover (OSHC) has to run for the whole length of your visa, not just the course. Most universities arrange it with the provider they have an agreement with; buy it through them unless you have a reason not to.

Medical examination — with a clinic on Australia's panel. In Pakistan that is IOM, which is what your checklist means by the IOM medical certificate. Do not use an ordinary hospital; a certificate from a clinic that is not on the panel does not count.

Police character certificate — Australia assesses character, and this is the evidence for it.

Both the medical and the police certificate have a shelf life, so line them up with the application rather than getting them early.$$,
   null, null),

  (70, 'both', 'What to have ready',
   $$- Confirmation of Enrolment (CoE) for a CRICOS-listed course
- Passport
- Answers to the four Genuine Student questions
- Proof of funds: bank statements, plus the property valuation and wealth certificates
- Evidence of where the funds came from, and of any sponsor
- OSHC policy covering the full visa period
- Medical examination through the IOM panel clinic
- Police character certificate
- Academic transcripts and degrees, with IBCC and HEC attestation
- English language evidence as your provider required it

The English level is set by your provider and your course rather than by one national score, so work from what your offer asked for.$$,
   null, null),

  (80, 'both', 'Working while you study',
   $$Up to 48 hours a fortnight during term, and unlimited hours during the university's scheduled breaks.

A fortnight means any two-week period, not a calendar fortnight, so two heavy weeks back to back can breach it even if each week looks reasonable on its own.

Masters by Research and doctoral students have no cap at all.

The limit is a visa condition. Exceeding it puts the visa at risk, not just the job.$$,
   null, null),

  (90, 'both', 'When to apply, and how long it takes',
   $$You can apply as soon as you hold the CoE, and there is no reason to wait — Home Affairs does not publish a fixed processing time, and the honest answer is that it varies by person and by provider.

Because there is no published figure to plan against, work from the CoE's course start date backwards and leave real slack. Add time for the medical and the police certificate, which are not instant, and for the biometrics letter to arrive after you lodge.$$,
   null, null),

  (100, 'staff', 'Note for the counsellor',
   $$Five things specific to Australia:

1. Nothing is lodged anywhere. It is ImmiAccount end to end, and the High Commission explicitly asks not to be telephoned about visas. If a family wants somebody to ring, the Home Affairs Global Service Centre is +61 2 6196 0196 — but there is rarely anything to chase.
2. The Genuine Student answers are where cases are won and lost, and the advice changed in March 2024. GS does not ask the student to prove they will leave; it asks whether the study commitment is genuine, and policy accepts a later move to skilled migration. Anyone still coaching students to promise a return home is answering the old test. Four questions, 150 words each, in English, in the form.
3. AUD 2,500 since 1 July 2026, up from 2,000 and before that 1,600, non-refundable. Quote the current figure; a family working from an older number will be short.
4. Panel clinic only for the medical. IOM in Pakistan. A certificate from any other hospital is wasted money.
5. 48 hours a fortnight is a rolling two weeks, not a calendar one. Worth saying before a student takes a job, because breaching it is a visa condition breach.

Living costs are AUD 29,710 for twelve months plus first-year tuition plus airfare, and the Department reviews the figure — re-check it here rather than leaving staff to discover a change.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'AU'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
