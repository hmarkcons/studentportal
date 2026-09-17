-- The United States' visa page, built from no office records.
--
-- The US needs leading with something that took effect two days before this
-- was written. On 15 September 2026 DHS's final rule replacing "duration of
-- status" came into force. An F student is no longer admitted for as long as
-- they remain enrolled: they get a fixed period — the programme length on the
-- I-20, not exceeding four years, plus 30 days to arrive and 30 to depart —
-- shown as the Admit Until Date on the I-94. It applies to students already in
-- the country. Staying beyond it now means filing an extension of stay with
-- USCIS on Form I-539, or leaving and being re-admitted.
--
-- Every piece of guidance written before this summer describes the old system,
-- in which an enrolled student simply stayed. That is no longer true and the
-- consequence of not knowing is falling out of status.
--
-- Three other things are recent enough to matter:
--
--   1. The Visa Integrity Fee. USD 250 per visa issuance, collected at the
--      post when the visa is issued rather than in advance, on top of the
--      USD 185 MRV and USD 350 SEVIS fees. Rollout is uneven — universities
--      report that some posts have begun charging and others have not — and it
--      is refundable only in theory, with the procedure still unfinalised. A
--      family that budgeted 535 dollars can meet a 250 dollar surprise at the
--      end.
--
--   2. Social media. Since June 2025, F, M and J applicants must disclose
--      every social media username from the past five years on the DS-160,
--      including inactive accounts, and set their profiles to public for the
--      duration of the process. Restricting visibility or omitting an account
--      can delay or sink an application.
--
--   3. The entry restrictions, and where Pakistan actually stands. Pakistan is
--      on neither the full nor the partial list of the proclamation effective
--      1 January 2026 — that proclamation does suspend F, M and J entry, but
--      for other countries. Pakistan does appear on a separate pause affecting
--      IMMIGRANT visas only, which does not touch F-1. Students hear "travel
--      ban" and panic, so the page states the distinction plainly and tells
--      them the lists change.
--
-- Sources: DHS Study in the States for the fixed-admission rule, Boston
-- University's ISSO on the Visa Integrity Fee, State Department guidance as
-- reported by university international offices for the social media
-- requirement, Ohio State's OIA for the proclamation country lists, and
-- pk.usembassy.gov / ustraveldocs.com for the posts.

-- ------------------------------------------------------------- the offices
-- verified_at left null on all three: the route is beyond doubt, but
-- pk.usembassy.gov returned 403 throughout, so the street addresses came from
-- listings rather than being read at source. The badge is about whether the
-- entry has been checked against the official source, and it has not.
insert into public.visa_offices
  (destination_id, kind, name, city, address, phone, website, appointment_url,
   submits_applications, notes, internal_notes, source_url, sort_order)
select d.id, v.kind, v.name, v.city, v.address, v.phone, v.website, v.appointment_url,
       true, v.notes, v.internal_notes, v.source_url, v.sort_order
from public.destinations d
cross join (values

  ('embassy',
   'U.S. Embassy Islamabad',
   'Islamabad',
   'Diplomatic Enclave, Ramna 5, Islamabad',
   '+92 51 208 0000',
   'https://pk.usembassy.gov/nonimmigrant-visas/',
   'https://www.ustraveldocs.com/pk/',
   'Interviews here, by appointment booked through ustraveldocs.com/pk. Islamabad prioritises student and exchange visitor visas (F and J), which works in your favour. You can generally choose between Islamabad and Karachi, so check both for the earlier date.',
   'Address from published listings — pk.usembassy.gov returned 403 to automated requests so it could not be read at source. Confirm before sending a student, then tick confirmed.',
   'https://pk.usembassy.gov/nonimmigrant-visas/',
   10),

  ('consulate',
   'U.S. Consulate General Karachi',
   'Karachi',
   'Plot No. 3-5, New TPX Area, Mai Kolachi Road, Karachi',
   null,
   'https://pk.usembassy.gov/nonimmigrant-visas/',
   'https://www.ustraveldocs.com/pk/',
   'Interviews here too, booked the same way. Karachi also prioritises student and exchange visitor visas. Appointments can generally be booked at either Karachi or Islamabad, whichever gives the earlier date.',
   'Address from published listings; pk.usembassy.gov returned 403 so it was not read at source.',
   'https://pk.usembassy.gov/nonimmigrant-visas/',
   20),

  ('consulate',
   'U.S. Consulate General Lahore',
   'Lahore',
   '50 Shahrah-e-Abdul Hameed Bin Badees (Old Empress Road), near Shimla Hill, Lahore',
   null,
   'https://pk.usembassy.gov/nonimmigrant-visas/',
   'https://www.ustraveldocs.com/pk/',
   'The third US post in Pakistan. Check which posts are offering student visa appointments when you book — availability differs between them and changes.',
   'Address from published listings; pk.usembassy.gov returned 403 so it was not read at source. Whether Lahore currently takes F-1 interviews was not confirmed — the F/J prioritisation statements found referred to Islamabad and Karachi. Check before directing a student here.',
   'https://pk.usembassy.gov/nonimmigrant-visas/',
   30)

) as v(kind, name, city, address, phone, website, appointment_url, notes, internal_notes, source_url, sort_order)
where d.country_code = 'US'
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

  (10, 'both', 'What changed on 15 September 2026',
   $$This is the most important thing on the page, and it is very new.

Until now an F-1 student was admitted for "duration of status" — you could stay as long as you remained enrolled, with no end date on your entry record. That ended on 15 September 2026.

You are now admitted for a fixed period: the length of the programme on your Form I-20, not exceeding four years, plus 30 days before the start date to arrive and 30 days afterwards to leave. The date is printed on your Form I-94 as the Admit Until Date.

Two consequences:

- Know your Admit Until Date and watch it. It is not the same as your visa's expiry date and not the same as your course end date.
- If you need to stay beyond it, you must apply to USCIS for an extension of stay on Form I-539 and pay the fee, or leave the United States and be admitted again.

It applies to students already in the country too, not only new arrivals. Any guidance written before this summer describes the old system and will tell you that staying enrolled is enough. It no longer is.$$,
   'DHS: fixed period of admission', 'https://studyinthestates.dhs.gov/final-rule-establishing-a-fixed-time-period-of-admission-and-an-extension-of-stay-procedure-quick'),

  (20, 'both', 'How the application works',
   $$Five steps, in this order:

1. Your university issues a Form I-20. It must be a school certified by the Student and Exchange Visitor Program.
2. Pay the SEVIS I-901 fee. Do this before the interview — you take the receipt with you.
3. Complete the DS-160 online application form.
4. Pay the visa application fee and book an interview through ustraveldocs.com/pk.
5. Attend the interview at the Embassy in Islamabad or a Consulate General.

There is no visa application centre for the United States in Pakistan and no third-party submission. You attend a US consular post in person.$$,
   'Book an appointment', 'https://www.ustraveldocs.com/pk/'),

  (30, 'both', 'What it costs — including one fee charged at the end',
   $$Three government fees, and the third one catches people out:

- SEVIS I-901 fee: USD 350, paid before the interview.
- Visa application (MRV) fee: USD 185, paid before the interview and not refunded whatever the outcome.
- Visa Integrity Fee: USD 250, charged when the visa is issued, at the post.

That is about USD 785 in total. The third one is new, and unlike the others it is not paid in advance — it is collected after you are approved, so a family that budgeted for 535 dollars can meet a 250 dollar surprise at the end. Budget for it from the start.

Two honest caveats. Its rollout is uneven: universities report that some consular posts have begun charging it and others have not yet, so ask what applies at your post. And it is described as refundable if you comply with your visa conditions and leave on time — but the procedure for claiming that refund is still being finalised, so do not count on getting it back.$$,
   null, null),

  (40, 'both', 'Your social media has to be public',
   $$Since June 2025 this has been a real requirement, not a formality.

On the DS-160 you must list every social media username you have used in the past five years — including accounts you no longer use. And you must set those profiles to public, and keep them public throughout the visa process.

Consular officers review what is publicly visible: your posts, your bio, your activity. They are checking that you are who you say you are and that what is there is consistent with your application.

Leaving an account off the form, or setting a profile back to private partway through, can delay the application or lead to a refusal. Go through your accounts properly before you fill in the DS-160 — including old ones you had forgotten about.$$,
   null, null),

  (50, 'both', 'Where you interview',
   $$There are three US posts in Pakistan: the Embassy in Islamabad and Consulates General in Karachi and Lahore. Appointments are booked through ustraveldocs.com/pk.

Two things worth knowing:

- Islamabad and Karachi both prioritise student and exchange visitor visas. That is deliberate and it works in your favour.
- You can generally choose between posts. If Islamabad is booked out, check Karachi — and the other way round. Wait times differ between them and move about, so look at both rather than accepting the first date you are offered.

Check which posts are currently taking student interviews when you book, since availability changes.$$,
   null, null),

  (60, 'both', 'Travel restrictions: where Pakistan stands',
   $$Worth being precise about, because "travel ban" headlines cause a lot of unnecessary worry.

A presidential proclamation effective 1 January 2026 restricts entry from a list of countries — a full ban on some and a partial ban on others, and the partial ban does include student visas. Pakistan is on neither list.

Separately, there is a pause on issuing immigrant visas that covers a longer list of countries, and Pakistan does appear on that one. It applies to immigrant visas only. It does not affect an F-1 student visa.

So as things stand, neither measure stops a Pakistani student applying for or receiving an F-1 visa.

These lists are reviewed and changed, so this is a position as at now rather than a permanent one. Ask your counsellor to check it again before you book an interview.$$,
   null, null),

  (70, 'both', 'The interview',
   $$The interview is short and it turns on one question: are you a genuine student who intends to return home afterwards? US law requires the officer to presume you are not, and it is for you to show otherwise.

What that means in practice:

- Be able to explain your course and why that university, in your own words.
- Be able to explain who is paying and show it — the same figures as on your I-20 and your DS-160.
- Be able to explain your ties to Pakistan and what you intend to do after you graduate.

Consistency matters more than polish. Your answers, your DS-160, your I-20 and your financial documents should all say the same thing. Where they differ, that difference becomes the interview.

Answer what is asked, briefly and truthfully. Do not recite a prepared speech.$$,
   null, null),

  (80, 'both', 'What to take',
   $$- Passport, valid at least six months beyond your intended stay
- Form I-20, signed
- DS-160 confirmation page
- SEVIS I-901 fee receipt
- Visa application fee receipt
- Appointment confirmation
- Photograph to specification
- Evidence of funds for your first year, and of who is funding you
- Academic transcripts, degrees and test scores, with IBCC and HEC attestation
- Anything showing your ties to Pakistan and your plans after graduating

Take originals. And take the financial documents even if you were not asked for them in advance — the officer may ask, and not having them is a poor answer.$$,
   null, null),

  (90, 'staff', 'Note for the counsellor',
   $$The United States had no office records before this. Five things, and the first is urgent.

1. Duration of status ended on 15 September 2026. An F-1 student is now admitted for a fixed period — I-20 programme length, four years maximum, plus 30 days each side — with an Admit Until Date on the I-94, and it binds students already in the country. Staying beyond it needs an I-539 extension with USCIS or a departure and re-entry. Every piece of material older than this summer says an enrolled student simply stays, and repeating that now puts somebody out of status. Anyone advising on US cases needs this today.

2. The Visa Integrity Fee is USD 250 and is charged at issuance, not in advance. Total government fees are about USD 785, not 535. Quote the higher number. Rollout is uneven between posts, so say "expect it" rather than promising it will or will not be charged, and do not describe it as refundable — the refund procedure is not finalised.

3. Social media must be public and every username from five years declared on the DS-160, including dormant accounts. This has been in force since June 2025 and students routinely do not know. Raise it before the DS-160 is filled in, not after.

4. On travel bans, be precise. Pakistan is on neither the full nor partial list of the proclamation effective 1 January 2026. Pakistan is on the separate immigrant-visa pause, which does not touch F-1. Both statements are true and students conflate them. Re-check before each interview booking because the lists are revised.

5. Post flexibility is a real lever. Islamabad and Karachi both prioritise F and J, and applicants can generally book at either — so check both when a date looks far out.

Two housekeeping notes. All three office rows are deliberately left unconfirmed: the route is certain, but pk.usembassy.gov returned 403 throughout so the addresses came from listings rather than source. And whether Lahore currently takes F-1 interviews was not confirmed — the prioritisation statements we found named Islamabad and Karachi only, so check before sending anyone to Lahore.

The US is one of our better-tracked destinations already, with the I-20 status on the tracker. It has no scholarship bodies linked.$$,
   null, null)

) as s(sort_order, audience, title, body, link_label, link_url)
where d.country_code = 'US'
  and not exists (
    select 1 from public.visa_page_sections v
    where v.destination_id = d.id and v.title = s.title
  );
