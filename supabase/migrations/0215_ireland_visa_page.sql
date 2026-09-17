-- Ireland's visa page, and the route 0199 left unestablished.
--
-- Ireland is the thinnest destination in the portal — one tracker field and
-- two document templates — so this page is carrying most of the guidance
-- rather than supplementing a tracker that already explains the process.
--
-- Two things dominate it, and both are specific to Ireland:
--
--   1. The ILEP. Stamp 2 student permission requires a full-time course on the
--      Interim List of Eligible Programmes. Ireland is on our private track,
--      which is exactly where this bites: a private college can make a
--      perfectly genuine offer for a programme that carries no student
--      permission at all. The offer is not the test; the list is.
--
--   2. The tuition rule changed on 30 June 2025. A minimum of EUR 6,000 —
--      or the whole fee where it is less — has to be paid to the institution
--      before the visa is granted, and the acceptance letter has to show the
--      payment received. Money now moves before the visa decision rather than
--      after it, which reorders the whole conversation with a family.
--
-- On where it is submitted: the application is made online in AVATS, and the
-- summary form AVATS generates is what names the office or centre the
-- documents go to. That is the honest answer and it is also the authoritative
-- one, so the page says it rather than asserting a centre address we could not
-- read. VFS runs Ireland's centre in Pakistan — it publishes a Pakistan
-- Ireland portal — but VFS blocks automated requests, so the cities could not
-- be captured and both office records are left unconfirmed for staff to check.
--
-- Sources: Immigration Service Delivery and Citizens Information for the
-- requirements, AVATS for the application route, the Workplace Relations
-- Commission for the Stamp 2 work limits.

-- ------------------------------------------------------------- the offices
update public.visa_offices
set address = 'Level 6, West Wing, Serena Business Complex, Khayaban-e-Suhrwardy Road, G-5/1, Islamabad',
    phone = '+92 302 856 3388',
    office_hours = 'Not published. The Embassy is contacted through the web form on ireland.ie; the number above is for emergencies only.',
    notes = 'Visa applications are not made over the counter here. You apply online in AVATS, and the summary form it produces tells you where to submit your documents. The Embassy is contacted through its web form — the telephone number is for consular emergencies, not visa enquiries.',
    internal_notes = 'Address is from the Embassy''s published listing; ireland.ie returns 403 to automated requests so it could not be read end to end. No general switchboard or visa email is published — contact is by web form. There is also an Honorary Consulate in Karachi, not recorded here. Confirm before sending a student, then tick confirmed.',
    source_url = 'https://www.ireland.ie/en/pakistan/islamabad/about/embassy-information/'
where name = 'Embassy of Ireland, Islamabad'
  and internal_notes = 'Contact details and the visa route still to be confirmed from the embassy''s own contact page.';

insert into public.visa_offices
  (destination_id, kind, name, operator, website, appointment_url,
   submits_applications, notes, internal_notes, source_url, sort_order)
select d.id, 'visa_centre', 'Ireland Visa Application Centre', 'VFS Global',
  'https://visa.vfsglobal.com/pak/en/irl/',
  'https://visa.vfsglobal.com/pak/en/irl/',
  true,
  'Where the documents and biometrics go after the online AVATS application. Confirm the centre for your city from the summary form AVATS gives you — that form is the instruction, not this page.',
  'VFS publishes a Pakistan-Ireland portal, which is how we know it holds the contract, but it blocks automated requests so the centre cities and addresses could not be captured. AVATS is the authority on where a given applicant submits. Confirm and tick before relying on this.',
  'https://visa.vfsglobal.com/pak/en/irl/',
  10
from public.destinations d
where d.country_code = 'IE'
  and not exists (
    select 1 from public.visa_offices v
    where v.destination_id = d.id and v.name = 'Ireland Visa Application Centre'
  );

-- ------------------------------------------------------------- the sections
insert into public.visa_page_sections
  (destination_id, title, body, link_label, link_url, audience, sort_order)
select d.id, s.title, s.body, s.link_label, s.link_url, s.audience, s.sort_order
from public.destinations d
cross join (values

  (10, 'both', 'How the application works',
   $$Ireland is not in the Schengen area, so this is an Irish visa and nothing else counts towards it.

1. Apply online in AVATS, the Irish visa system. Everything starts there.
2. AVATS produces a summary application form. That form tells you exactly where to take your documents — read it rather than assuming.
3. Submit the documents and give biometrics at the Ireland Visa Application Centre, run by VFS Global.

The Embassy in Islamabad does not take visa applications over the counter, and its telephone number is for consular emergencies rather than visa questions. It is contacted through a web form.

What you are applying for is a long stay 'D' visa, which becomes Stamp 2 permission once you register in Ireland.$$,
   'AVATS online application', 'https://www.visas.inis.gov.ie/avats/'),

  (20, 'both', 'Your course must be on the ILEP',
   $$This is the first thing to check, before anything else.

Stamp 2 student permission is only granted for a full-time course on the Interim List of Eligible Programmes — the ILEP. If the programme is not on that list, there is no student permission available for it, however genuine the college and however real the offer letter.

A private college can make you a perfectly sincere offer for a course that carries no immigration permission at all. The offer is not the test. The list is.

Check the programme against the ILEP before you pay any fee, and ask your counsellor to confirm it. This matters more for Ireland than for our other destinations.$$,
   'Interim List of Eligible Programmes', 'https://www.irishimmigration.ie/coming-to-study-in-ireland/what-are-my-study-options/interim-list-of-eligible-programmes-ilep/'),

  (30, 'both', 'You pay tuition before the visa, not after',
   $$Ireland changed this on 30 June 2025, and it reverses the order people expect.

You must have paid at least EUR 6,000 in tuition to the college — or the whole fee, if the course costs less than that — before the visa is granted. Your letter of acceptance has to show that the payment has been received.

So the money moves first and the decision comes second. Plan for that: it is a real sum committed before anybody knows the outcome.

Ask the college in writing what its refund position is if the visa is refused. Reputable institutions have one. Get it before you transfer anything.$$,
   null, null),

  (40, 'both', 'The EUR 10,000',
   $$Separately from the fees, you have to show EUR 10,000 for each year of the course — immediate access to it for the first year, and evidence that the same will be available for each year after that.

This is living costs. It does not overlap with the tuition you have already paid.

Two ways to show it:

- Six months of bank statements, or
- A EUR 10,000 education bond, lodged through an approved provider. Our checklist calls this the Euro Bonds route, and for many families it is the cleaner of the two because it answers the question in one document.

Ask your counsellor which route suits your case before you start gathering statements.$$,
   null, null),

  (50, 'both', 'Medical insurance',
   $$Private medical insurance is required, and you need it in place for the visa application rather than after you arrive.

Take the policy document itself, not a quotation or a summary email. Check that it covers you from your date of arrival and for the full period of the permission you are asking for.$$,
   null, null),

  (60, 'both', 'What it costs',
   $$- Visa application: EUR 60 for a single entry, EUR 100 for multiple entry. Not refunded if refused.
- Irish Residence Permit, after you arrive: EUR 300.

Plus the tuition prepayment above, and the EUR 10,000 shown rather than spent.

Budget the EUR 300 now rather than discovering it in your first month in Ireland.$$,
   null, null),

  (70, 'both', 'What to submit',
   $$- The AVATS summary application form, signed
- Passport, and passport photographs
- Letter of acceptance for an ILEP-listed course, showing the tuition payment received
- Proof of the EUR 10,000 — statements or the education bond
- Private medical insurance policy
- Academic transcripts and certificates, with IBCC and HEC attestation
- English language evidence as the college required it
- Evidence of your own finances and of anyone sponsoring you

Where a document is not in English, take a certified translation.$$,
   null, null),

  (80, 'both', 'How long it takes',
   $$Expect a decision within eight weeks of the visa office receiving your application. July to September is the crush, and it runs longer then.

Eight weeks is measured from receipt of a complete application, not from the day you started filling in AVATS. Work backwards from the start of term and add the time to get the offer, pay the tuition and gather the statements.$$,
   null, null),

  (90, 'both', 'After you arrive',
   $$Register for your IRP. Within 90 days of arriving you must register with Immigration Service Delivery to get your Irish Residence Permit. That is what turns the visa into Stamp 2 permission, and it costs EUR 300. Failing to register puts your permission at risk.

Working while you study. Stamp 2 allows up to 20 hours a week during term, and up to 40 hours a week in the holiday periods — June to September inclusive, and 15 December to 15 January. Those are the only holiday periods; the limit is 20 hours at every other time of year.

After the course. The Third Level Graduate Programme gives eligible graduates Stamp 1G, allowing 40 hours a week for twelve months after finishing, extendable by a further twelve subject to conditions. The exact entitlement depends on the level of your award, so check it with your college rather than assuming.$$,
   null, null),

  (100, 'staff', 'Note for the counsellor',
   $$Ireland is our thinnest destination in the portal — one tracker field and two document templates — so this page is doing most of the work. Five things:

1. ILEP first, always. Ireland is on our private track and that is precisely where this goes wrong: a private college can issue a genuine offer for a programme that carries no student permission. Check the ILEP before a student pays anything, and before we accept the case.
2. Tuition before the visa, since 30 June 2025. Minimum EUR 6,000, or the full fee if lower, evidenced on the acceptance letter. A family is committing real money ahead of the decision, so get the college's refund position in writing first. This is the single biggest change to how an Ireland case is sequenced.
3. EUR 10,000 a year on top, and the education bond is often the cleaner route — it is already on our checklist as Euro Bonds. Decide statements or bond early rather than gathering six months of the wrong thing.
4. EUR 300 IRP within 90 days of arrival. Students routinely do not know about this one.
5. Eight weeks, longer July to September.

Both office records are deliberately left unconfirmed. AVATS is the authority on where a given applicant submits — the summary form it generates names the office — and VFS blocks automated reads, so we could not capture the centre cities. ireland.ie returns 403 as well, so the Embassy address came from its published listing rather than a page we could read in full. Confirm both and tick them in Setup.

Ireland also has an Honorary Consulate in Karachi, which is not in the office list. Add it if it turns out to matter for our students.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'IE'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
