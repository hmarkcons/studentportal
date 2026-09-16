-- Spain's visa page.
--
-- Spain had the two offices from 0199 and its tracker fields, but nothing
-- telling a student what Spain actually asks for — so the page rendered a
-- checklist with no instructions beside it. These are the sections the Visa
-- page builder edits: the office can change any word of this afterwards, and
-- re-running this migration will not overwrite an edit, because each insert is
-- guarded on the title already being there.
--
-- Sources are Spain's own consular requirements for a long-stay student visa
-- (exteriores.gob.es) and the Pakistan routing through BLS already recorded in
-- visa_offices. Two things are deliberately written as "check before you rely
-- on this": the IPREM figure, which Spain resets in each year's budget, and the
-- fact that consulates differ in the detail. Both are the kind of number a
-- student acts on, and a page that states them as permanent truth ages badly.

insert into public.visa_page_sections
  (destination_id, title, body, link_label, link_url, audience, sort_order)
select d.id, s.title, s.body, s.link_label, s.link_url, s.audience, s.sort_order
from public.destinations d
cross join (values

  (10, 'both', 'How the application works',
   $$The student visa for Spain is a long-stay (type D) visa, because the course runs longer than 90 days.

Applications are lodged in person at a BLS centre — Islamabad, Lahore or Karachi — not at the Embassy. Book the appointment yourself at thespainvisa.com; booking is free, and BLS's service fee is paid at the centre on the day.

Bring the original and a photocopy of everything. BLS checks that the file is complete; the decision is the Embassy's.$$,
   'Book a BLS appointment', 'https://thespainvisa.com/'),

  (20, 'both', 'What to take to the appointment',
   $$- National visa application form, completed and signed on every page
- Passport: at least one year of validity left, two blank pages, and not issued more than ten years ago
- One passport photograph taken in the last six months, facing forward, no glasses
- Letter of acceptance from the Spanish university, in Spanish, naming the programme and its dates
- Proof that the enrolment fee has been paid, or that it has been waived
- Proof of funds — see "The money rule" below
- Health insurance — see "The insurance Spain accepts" below
- Medical certificate issued within the last three months
- Police clearance certificate, apostilled
- Academic documents, apostilled and sworn-translated

Every foreign document needs a Hague Apostille first and then a traducción jurada — a sworn translation by a translator Spain recognises. Work from an ordinary translation agency is refused.$$,
   null, null),

  (30, 'both', 'The money rule',
   $$Spain sets the figure as a multiple of the IPREM, its official income index, rather than as a fixed amount. A student has to show 100% of the IPREM for every month of the course.

For 2026 the IPREM is 600 euros a month — about 6,000 euros for a ten-month academic year, or 7,200 for twelve. It is worth showing more than the minimum rather than exactly it.

Two things the consulate looks at beyond the total:

- Three months of bank statements, stamped by the bank. A screenshot from a banking app is not accepted.
- No sudden large deposit shortly before the application. Money that appeared last week reads as borrowed for the appointment, and is one of the commonest reasons a file is refused.

The IPREM is reset in each year's Spanish budget. Confirm the current figure before a student prepares their statements rather than working from the number above.$$,
   null, null),

  (40, 'both', 'The insurance Spain accepts',
   $$Ordinary travel insurance does not qualify, which catches most applicants out.

The policy has to:
- be from an insurer registered with Spain's Dirección General de Seguros;
- cover at least 30,000 euros;
- match the cover of the Spanish national health system;
- carry no excess, co-payment or deductible at all.

A policy with even a small excess is refused however good the rest of it is. Read the policy wording, not the broker's summary, before paying for it.$$,
   null, null),

  (50, 'both', 'Police and medical certificates',
   $$Both are required, because the course is longer than 180 days.

Police clearance: from every country lived in during the past five years, not only Pakistan. Each one apostilled and sworn-translated into Spanish.

Medical certificate: it has to state, in the wording Spain requires, that the applicant is free of any disease with public health implications under the International Health Regulations 2005. A general fitness letter from a doctor is not enough. It must be less than three months old on the day of the appointment.$$,
   null, null),

  (60, 'both', 'How long it takes',
   $$Allow at least four weeks from a complete submission at BLS, and plan for six — Pakistan is among the slower posts for Spanish visas.

Count backwards from the start of term rather than forwards from today, because two of the documents expire. Apostilles first, then the sworn translations, then the medical certificate last, so that it is still inside its three months on the day of the appointment.$$,
   null, null),

  (70, 'staff', 'Note for the counsellor',
   $$The four refusals worth heading off, in the order they actually happen:

1. Insurance with an excess. Every ordinary travel policy has one. Check the policy document itself.
2. A large deposit shortly before the appointment. Ask for three months of statements early enough that the problem can be fixed by waiting rather than by explaining.
3. An ordinary translation instead of a traducción jurada.
4. A medical certificate in the wrong wording, or out of date by the appointment.

Spanish consulates differ in the detail of what they ask for. This page follows Spain's national rules; where the Embassy in Islamabad publishes something different, Islamabad wins. Check their page before the first application of each season.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'ES'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );

-- ------------------------------------------- the address the student travels to
-- 0199 seeded this office with a note to confirm the Islamabad address, because
-- the centre moved on 6 July 2026 and the old one was still circulating.
-- Confirmed against thespainvisa.com, which is Spain's official visa site for
-- Pakistan; Lahore and Karachi exist but publish no street address there, which
-- the note now says rather than leaving a counsellor to assume the gap is an
-- oversight.
--
-- Guarded on the old note so this cannot overwrite an address somebody has
-- since checked and corrected by hand.
update public.visa_offices
set address = 'Intiana (Pvt.) Ltd., 2nd Floor, Plot No. 3-A, G-7 Markaz, Islamabad',
    email = 'info@thespainvisa.com',
    notes = 'Appointments are booked free at thespainvisa.com; the service fee is paid at the centre. Islamabad slots are reported to be easier to get than Lahore or Karachi. The Islamabad centre moved on 6 July 2026 to the address above — older addresses are still circulating online. Lahore and Karachi centres exist but publish no street address; book through the site and it gives the location.',
    verified_at = now()
where name = 'BLS Spain Visa Application Centre'
  and address is null
  and notes like '%moved in July 2026%';
