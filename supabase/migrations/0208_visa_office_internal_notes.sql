-- Notes we wrote to ourselves were being read by students.
--
-- visa_offices.notes renders on the student's Visa page. The offices seeded in
-- 0199 carry research to-dos in that field — "Contact details still to be
-- confirmed", "Confirm the per-city addresses before sending a student" —
-- because at the time there was nowhere else to put them. Eleven of nineteen
-- offices did. A student looking up where to hand in their visa application
-- was reading our unfinished homework.
--
-- Splitting the field is the fix rather than rewording eleven rows, because the
-- rewording lasts until the next office is added with a to-do in it. There is
-- now somewhere for the to-do to go, and the staff pages are where it shows.

alter table public.visa_offices
  add column if not exists internal_notes text;

comment on column public.visa_offices.notes is
  'Shown to the student on their Visa page. Only what a student should read.';
comment on column public.visa_offices.internal_notes is
  'Staff only — never rendered on the student portal. What still needs checking, which source disagreed, who to ring.';

-- ------------------------------------------------- move the to-dos across
-- Each of these splits one seeded note into the half a student should read and
-- the half they should not. Guarded on the exact seeded wording, so a row
-- somebody has already rewritten by hand is left alone.
update public.visa_offices set
  notes = 'Student visas are lodged online through ImmiAccount; biometrics are collected at a centre.',
  internal_notes = 'Centre details to be confirmed.'
where name = 'Australian High Commission, Islamabad'
  and notes = 'Student visas are lodged online through ImmiAccount; biometrics are collected at a centre. To be confirmed.';

update public.visa_offices set
  notes = 'Study visa applications are lodged at BLS, not at the Embassy. Check the BLS site for your city''s address and current timings.',
  internal_notes = 'Per-city addresses and timings not yet confirmed against the BLS site.'
where name = 'BLS Italy Visa Application Centre'
  and notes = 'Study visa applications are lodged at BLS, not at the Embassy. Confirm the per-city addresses and current timings on the BLS site before sending a student.';

update public.visa_offices set
  notes = 'Applications for France go through France-Visas; your counsellor will confirm which centre handles your city.',
  internal_notes = 'Visa route and centre operator still to be confirmed via France-Visas.'
where name = 'Embassy of France in Pakistan'
  and notes = 'Visa route and centre operator still to be confirmed via France-Visas.';

update public.visa_offices set
  notes = null,
  internal_notes = 'Contact details still to be confirmed.'
where name = 'Embassy of Hungary, Islamabad'
  and notes = 'Contact details still to be confirmed.';

update public.visa_offices set
  notes = null,
  internal_notes = 'Contact details and the visa route still to be confirmed from the embassy''s own contact page.'
where name = 'Embassy of Ireland, Islamabad'
  and notes = 'Contact details and the visa route still to be confirmed from the embassy''s own contact page.';

update public.visa_offices set
  notes = 'National (study) visa appointments for Sindh and Balochistan.',
  internal_notes = 'Contact details still to be confirmed.'
where name = 'German Consulate General Karachi'
  and notes = 'National (study) visa appointments for Sindh and Balochistan. Contact details still to be confirmed.';

update public.visa_offices set
  notes = 'National (study) visa appointments for applicants outside Sindh and Balochistan.',
  internal_notes = 'Address, phone and hours still to be confirmed from the mission''s own contact page.'
where name = 'German Embassy Islamabad'
  and notes = 'National (study) visa appointments for applicants outside Sindh and Balochistan. Address, phone and hours still to be confirmed from the mission''s own contact page.';

update public.visa_offices set
  notes = 'Luxembourg has no mission in Pakistan — another Schengen country handles its visas. Your counsellor will confirm which.',
  internal_notes = 'Which Schengen partner represents Luxembourg for visas still to be confirmed.'
where name = 'Luxembourg — Ministry of Foreign and European Affairs'
  and notes = 'Luxembourg has no mission in Pakistan. Which Schengen partner represents it for visas still to be confirmed.';

update public.visa_offices set
  notes = 'Biometrics and document submission for UKVI. Check the VFS site for your city''s address and timings.',
  internal_notes = 'Per-city addresses and timings not yet confirmed on VFS.'
where name = 'UK Visa Application Centre'
  and notes = 'Biometrics and document submission for UKVI. Confirm the per-city addresses and timings on VFS.';

update public.visa_offices set
  notes = 'The Embassy sends applicants here for appointments.',
  internal_notes = 'Centre cities and addresses not yet confirmed on VFS.'
where name = 'VFS Global — Austria'
  and notes = 'The Embassy''s own site sends applicants here for appointments. Confirm the centre cities and addresses on VFS.';
