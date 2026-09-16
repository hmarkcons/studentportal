-- France's visa page, and the AEG answer to 0199's open question.
--
-- France is not shaped like Spain or Italy. There is a mandatory step before
-- the visa exists at all — the Etudes en France procedure, run by Campus France
-- Pakistan, with its own fee, its own deadlines and its own academic interview
-- — and a student who treats France as "apply to a university, then apply for a
-- visa" has already missed the campaign. So the page leads with the three
-- stages rather than with a document list.
--
-- Sources: Campus France Pakistan (pakistan.campusfrance.org), which is the
-- official body for exactly this, AEG Travel Services (frenchvisa.aeg.com.pk),
-- and the French consular section's own page at pk.diplomatie.gouv.fr.
--
-- Two figures here are the kind that get a file refused if they are stale, and
-- both are written so a reader knows to check:
--
--   * the monthly funds requirement rose from 615 to 877.50 euros on 1 August
--     2026, the first change in twenty-four years. Every guide written before
--     then still says 615, which is why the page says so out loud.
--
--   * the Candidature calendar is per campaign year. The dates below are the
--     2026/27 round; a section saying "18 November" with no year attached
--     would quietly become wrong next autumn.

-- ------------------------------------------------------------- the offices
-- 0199 left this row saying the route and operator were still to be confirmed.
-- They are AEG, and the consular section's own address and number are public.
-- Guarded on that unresolved note so a row somebody has since corrected by
-- hand is left alone.
update public.visa_offices
set name = 'French Consular Section, Islamabad',
    city = 'Islamabad',
    address = 'Diplomatic Enclave G-5, P.O. Box 1068, Islamabad',
    phone = '+92 51 883 0402',
    submits_applications = true,
    notes = 'The student visa interview and submission happen here, by appointment. The appointment itself is booked through AEG — see below. The consular section does not answer visa enquiries by telephone; ask your counsellor or Campus France instead.',
    internal_notes = null,
    source_url = 'https://pk.diplomatie.gouv.fr/fr/presence-francaise/la-section-consulaire-islamabad',
    verified_at = now()
where name = 'Embassy of France in Pakistan'
  and internal_notes = 'Visa route and centre operator still to be confirmed via France-Visas.';

insert into public.visa_offices
  (destination_id, kind, name, city, operator, phone, website, appointment_url,
   office_hours, submits_applications, notes, source_url, verified_at, sort_order)
select d.id, 'visa_centre', 'AEG Travel Services (Pvt) Ltd',
  'Islamabad, Lahore, Karachi, Multan, Sialkot',
  'AEG Travel Services',
  '+92 21 111 234 111',
  'https://frenchvisa.aeg.com.pk/',
  'https://frenchvisa.aeg.com.pk/',
  'Monday to Saturday, 9am to 5pm, except national holidays',
  -- AEG books the appointment; the application is handed in at the consular
  -- section. Marking this false is what keeps the summary line honest.
  false,
  'All French visa appointments on ordinary passports are booked through AEG. You have to go to an AEG office in person with your documents and passport — appointments are not given over the telephone or by email.',
  'https://frenchvisa.aeg.com.pk/',
  now(),
  10
from public.destinations d
where d.country_code = 'FR'
  and not exists (
    select 1 from public.visa_offices v
    where v.destination_id = d.id and v.name = 'AEG Travel Services (Pvt) Ltd'
  );

-- ------------------------------------------------------------- the sections
insert into public.visa_page_sections
  (destination_id, title, body, link_label, link_url, audience, sort_order)
select d.id, s.title, s.body, s.link_label, s.link_url, s.audience, s.sort_order
from public.destinations d
cross join (values

  (10, 'both', 'How the application works',
   $$France has three stages, in this order, and the first one is not optional.

1. Etudes en France (EeF) — the Campus France procedure. You apply to French institutions through it, pay its fee and attend an academic interview. Nothing about the visa starts until this is done.
2. France-Visas — the online visa form, completed after an institution has accepted you.
3. The appointment — booked through AEG, then attended at the French Consular Section in Islamabad, where the application is handed in and the interview takes place.

A student who treats France as "apply to a university, then apply for a visa" has usually already missed the EeF campaign for that year.$$,
   'Campus France Pakistan', 'https://www.pakistan.campusfrance.org/'),

  (20, 'both', 'Stage one: Etudes en France',
   $$Everyone living in Pakistan going to France for a course longer than three months goes through EeF. There are two routes, and your counsellor will tell you which one you are on:

- Candidature — for French public institutions listed in the EeF catalogue.
- Pre-consular — where you already have direct admission to an institution outside the catalogue.

The fee is PKR 30,000. It is non-refundable, so be certain of your route before paying it.

After your file is validated you are called to an academic interview, held at Alliance Francaise in Islamabad, Lahore or Karachi. Take all your original documents and the fee receipt; they are checked against what you uploaded.

Campus France states that deadlines are strict and that missing them, or ignoring their instructions, can get the file rejected outright.$$,
   'EeF application rules', 'https://www.pakistan.campusfrance.org/eef-application-rules'),

  (30, 'both', 'The Candidature calendar',
   $$For the 2026/27 campaign:

- 1 October 2026 — applications open
- 18 November 2026 — application deadline
- December 2026 to March 2027 — Campus France reviews files
- 30 April 2027 — institutions give their decisions
- 31 May 2027 — you confirm your one final programme

These dates are for this campaign only and Campus France republishes them each year. Check the current calendar before working to them.$$,
   null, null),

  (40, 'both', 'Booking the appointment',
   $$Appointments for French visas on an ordinary passport are handled by AEG Travel Services, which has offices in Islamabad, Lahore, Karachi, Multan and Sialkot, open Monday to Saturday, 9am to 5pm.

You have to go to an AEG office in person, with your documents and your passport. AEG will not give an appointment over the telephone or by email.

The appointment itself is at the French Consular Section, Diplomatic Enclave G-5, Islamabad. That is where the application is handed in and where the interview happens — AEG books it, the consulate decides it.

Allow for the wait to get an appointment on top of the decision time below.$$,
   'AEG appointments', 'https://frenchvisa.aeg.com.pk/'),

  (50, 'both', 'The money rule',
   $$You have to show EUR 877.50 a month for the length of the course.

This figure changed on 1 August 2026. It was EUR 615 a month for the previous twenty-four years, so nearly every guide, forum post and older checklist still says 615. Anyone working from the old number will be roughly 260 euros a month short.

Campus France Pakistan asks for six months of your own bank statements, or the equivalent documents for a guarantor who is funding you. A scholarship award letter can stand in for part or all of it.

As everywhere, a large deposit that appears shortly before the application reads as borrowed money. Start the statements early enough that waiting is an option.$$,
   null, null),

  (60, 'both', 'What to take',
   $$- Passport, and passport photographs
- The France-Visas application form, completed and printed
- Your EeF file and the acceptance from the institution
- Proof of funds — six months of statements, or guarantor documents
- Accommodation certificate
- CV and a cover letter explaining your study plan
- Academic transcripts and degrees, with IBCC or HEC attestation
- Family Registration Certificate (FRC) from NADRA
- The OFII form, completed
- Travel insurance

Take originals as well as copies. The academic interview earlier in the process checks your originals against what you uploaded, and the consular appointment will too.$$,
   null, null),

  (70, 'both', 'How long it takes',
   $$Campus France Pakistan says the consulate decides between two weeks and two months after the interview.

Two months is the number to plan against, not two weeks, and the wait for an AEG appointment comes before any of it. Working backwards from the start of term is the only way this fits — the EeF campaign closes in November for a course starting the following September, so the whole thing is a year-long sequence rather than a summer errand.$$,
   null, null),

  (80, 'both', 'After you arrive: validate the visa',
   $$Your visa is a VLS-TS — a long-stay visa that acts as your residence permit, but only once you validate it.

You must validate it online within three months of arriving, at administration-etrangers-en-france.interieur.gouv.fr. There is a EUR 60 fiscal stamp for students. The three months run from the day you enter France, not from the date on the visa.

Do not let this slide. Until it is validated you have no residence permit, and the validation certificate carries the foreigner ID number you need for health insurance, for working, for a housing application, for travelling elsewhere in the Schengen area, and for renewing the permit later.$$,
   'Validate a long-stay visa', 'https://administration-etrangers-en-france.interieur.gouv.fr'),

  (90, 'staff', 'Note for the counsellor',
   $$Four things specific to France:

1. The EUR 615 figure. It rose to EUR 877.50 on 1 August 2026 and almost every guide online still carries the old number. A student who prepares statements against 615 is short by about 260 a month across the whole course. Check any figure a family quotes back at you.
2. The PKR 30,000 EeF fee is non-refundable. Settle the route — Candidature or pre-consular — before anyone pays it.
3. The EeF deadline is hard. Campus France says plainly that a late file or ignored instructions can be rejected, and there is no visa route that bypasses the procedure. Missing November means missing the year.
4. The consular section does not take visa calls. Chasing them by telephone achieves nothing; go through AEG or Campus France.

The Candidature dates on this page are the 2026/27 round. Update them here when Campus France publishes the next calendar rather than leaving staff to remember the difference.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'FR'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
