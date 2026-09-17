-- Hungary's visa page, and the route 0199 left unestablished.
--
-- Hungary is a two-stage country and the second stage has a clock on it. A
-- degree student applies for a residence permit at the Hungarian mission here.
-- If it is approved, what arrives is not the permit but a single-entry type D
-- visa: 30 days of stay, valid for three months. The permit card itself is
-- collected in Hungary inside that window. A student who treats the visa as
-- the finished article has thirty days to find out otherwise.
--
-- On the route: OIF, Hungary's immigration authority, is explicit that an
-- application from outside Hungary goes to "a diplomatic or consular foreign
-- mission of Hungary in the country of your nationality or your habitual place
-- of residence", and the Embassy in Islamabad publishes that its Consular and
-- Visa Section takes residence permit applications. There is no visa
-- application centre for Hungary in Pakistan. So the Embassy is now marked as
-- the place applications go.
--
-- One deliberate difference from the other destinations: no monthly money
-- figure. Spain, Italy, France, Germany and Austria all publish one. Hungary
-- does not — OIF states the test qualitatively and names the evidence instead.
-- Third-party guides fill the gap with numbers around HUF 200,000 a month that
-- could not be traced to any Hungarian source, so this page does not repeat
-- them. Inventing a threshold that the mission is not actually applying would
-- be worse than saying there isn't one.
--
-- Sources: OIF's own factsheet for students, the EU Immigration Portal's
-- Hungary student page for the fee and validity, and the Embassy of Hungary
-- Islamabad's published contact details.

-- ------------------------------------------------------------- the mission
-- verified_at is deliberately left null. The route is confirmed, but the
-- address and office hours came from the Embassy's contact listing rather than
-- from a page that could be read end to end, so the staff tab should keep
-- showing "Not yet confirmed" until somebody rings and checks. That badge
-- exists for exactly this.
update public.visa_offices
set submits_applications = true,
    address = 'House No. 12, Margalla Road, F-6/3, 44000 Islamabad',
    phone = '+92 51 207 7800',
    email = 'consulate.isl@mfa.gov.hu',
    office_hours = 'Consular and Visa Section: Mon-Thu 09:00-16:00, Fri 09:00-12:00. Closed at weekends and on public holidays.',
    notes = 'Student residence permit applications are lodged here — there is no visa application centre for Hungary in Pakistan. The Consular and Visa Section handles Schengen visas and residence permits. Contact the section to arrange your submission; general embassy email is mission.isl@mfa.gov.hu.',
    internal_notes = 'Route confirmed against OIF (applications from abroad go to the Hungarian mission) and the Embassy''s own consular information. Address, phone and hours are from the Embassy''s contact listing and were not readable end to end — confirm by telephone before sending a student, then tick confirmed.',
    source_url = 'https://islamabad.mfa.gov.hu/eng/page/elerhetosegeink'
where name = 'Embassy of Hungary, Islamabad'
  and internal_notes = 'Contact details still to be confirmed.';

-- ------------------------------------------------------------- the sections
insert into public.visa_page_sections
  (destination_id, title, body, link_label, link_url, audience, sort_order)
select d.id, s.title, s.body, s.link_label, s.link_url, s.audience, s.sort_order
from public.destinations d
cross join (values

  (10, 'both', 'A residence permit, then a visa to collect it',
   $$Hungary works in two stages and the second one is easy to misread.

You apply for a residence permit for the purpose of study, here in Pakistan, at the Embassy of Hungary. The decision is taken by the Hungarian immigration authority.

If it is approved, what you receive is not the permit. It is a type D visa that entitles you to collect the permit: a single entry, a stay of no more than 30 days, valid for three months. You travel on that, and you collect the residence permit card once you are in Hungary.

So there is a thirty-day window after you land in which the permit has to be sorted out. Your university's international office will walk you through it, but book your flight with that in mind rather than arriving and then taking a holiday.$$,
   'Hungarian immigration authority: student residence', 'https://oif.gov.hu/factsheets/residence-of-the-student-pupil'),

  (20, 'both', 'Where you apply',
   $$At the Embassy of Hungary in Islamabad — House No. 12, Margalla Road, F-6/3.

There is no visa application centre for Hungary in Pakistan. No VFS, no BLS, no third party. The Embassy's own Consular and Visa Section takes both Schengen visas and residence permit applications.

Contact the section to arrange your submission: consulate.isl@mfa.gov.hu. The section is open Monday to Thursday 09:00 to 16:00 and Friday 09:00 to 12:00.

If anybody directs you to a visa centre for a Hungarian study application, they have confused it with another country.$$,
   null, null),

  (30, 'both', 'The scholarship route',
   $$Most Pakistani students go to Hungary on Stipendium Hungaricum, the Hungarian government scholarship. If you are applying for it, that application runs on its own calendar and its own portal, separately from the residence permit.

It matters for the visa too. A scholarship award letter is the cleanest answer to the question of how you are funding yourself, and it usually covers the tuition proof as well.

Your counsellor records whether you are applying for a scholarship on your tracker. If you are, get the award decision before you book the Embassy submission — the file is much stronger with it than with a promise of it.$$,
   null, null),

  (40, 'both', 'Money: what Hungary actually asks',
   $$Hungary is different from the other destinations here, and it is worth understanding why.

Spain, Italy, France, Germany and Austria each publish a monthly figure you have to hit. Hungary does not. The requirement is that you have sufficient resources for your stay, and the authority names the evidence rather than a threshold:

- a certificate from a bank, in your own name, or
- a notarised declaration from a family member undertaking to maintain and support you.

You also show proof that tuition has been paid, and that you have health insurance.

Because there is no published number, the mission judges whether what you have shown is enough. Two consequences: show comfortably more than you think is needed rather than exactly enough, and ask the Consular Section what they currently expect to see before you assemble the file.

Be wary of figures quoted online. Amounts in Hungarian forints circulate on study-abroad sites that do not appear in any Hungarian government source.$$,
   null, null),

  (50, 'both', 'What the application needs',
   $$- Valid passport, covering at least the period you intend to stay
- Completed application form, with a real Hungarian address declared on it
- One facial photograph
- Certificate of admission from the Hungarian institution
- Proof of your language ability — a certificate or a diploma
- Proof that tuition has been paid
- Proof of health insurance
- Proof of funds, as set out above
- Attested academic documents — IBCC for school, HEC for degrees
- Parental consent, if you are under 18

Where a document is not in English or Hungarian, take a certified translation.$$,
   null, null),

  (60, 'both', 'Accommodation',
   $$Lighter than elsewhere, but not a blank.

You declare an existing, real Hungarian address as your accommodation on the application form. Unlike Spain or Italy, you do not have to attach a separate tenancy document or hotel booking to prove it.

That does not make it a formality. The address has to be real, and after you arrive the immigration office will want to see that your housing arrangements are genuine before the permit card is issued. University accommodation, or a dormitory place confirmed by the institution, is the simplest way through this.$$,
   null, null),

  (70, 'both', 'The fee, and how long it takes',
   $$The administrative service fee for a residence permit application submitted at a Hungarian mission is EUR 110, paid at the Embassy.

The authority must decide within 60 days of the application being submitted.

The permit is issued for at least one year, or for the length of the course if that is shorter, up to a maximum of three years. So for most degree courses it covers you for longer than a single year and is then extended.

Sixty days is the legal deadline rather than the typical wait, and it starts when a complete application goes in. Add the time to get the admission letter, the attestation and the scholarship decision before it.$$,
   null, null),

  (80, 'both', 'After you arrive',
   $$Collect the permit. You have 30 days on the type D visa. Go to the immigration office, show that your accommodation is real, and the residence permit card is issued — it is sent to the address you gave, which for most students is the university's.

Working while you study. With a valid student residence permit you may work up to thirty hours a week during the study period, and full time for up to ninety days a year outside it. Do not exceed it; the permit depends on your remaining a full-time student.

After the course. Hungary has a route to a residence permit for job-seeking or starting a business once you finish, applied for from inside the country.$$,
   null, null),

  (90, 'staff', 'Note for the counsellor',
   $$Five things specific to Hungary:

1. There is no visa centre. Applications go to the Embassy's Consular and Visa Section in Islamabad. If anyone on the team has been treating Hungary like Italy or the UK, correct it.
2. The approval is a 30-day visa, not the permit. Single entry, valid three months, 30 days of stay, and the card is collected in Hungary. Students and families read "visa approved" as finished. Say what the thirty days are for at the time the good news arrives.
3. There is no money figure, and we should not invent one. Hungary states the test qualitatively and names the evidence — a bank certificate in the student's own name, or a notarised family undertaking. Study-abroad sites quote forint amounts with no Hungarian source behind them; do not repeat those to a family. Ask the Consular Section what they want to see.
4. EUR 110 at the mission, decided within 60 days, permit issued for one to three years. The 60 days runs from a complete file.
5. Stipendium Hungaricum is the route most of our Hungary students take, and it answers the funding question better than any bank statement. Sequence the scholarship decision before the Embassy submission where the calendar allows.

The office record for the Embassy is deliberately still marked "Not yet confirmed": the route is established, but the address and hours came from the Embassy's contact listing rather than a page we could read in full. Ring them, then tick it confirmed in Setup.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'HU'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
