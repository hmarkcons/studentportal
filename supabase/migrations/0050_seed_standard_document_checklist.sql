-- Real gap found: document_templates was completely empty, so staff never
-- saw a standard document checklist for a new application — only whatever
-- they manually typed via "Add requirement". Seed a generic, universally
-- applicable checklist (level='all', destination_id=null — not tied to any
-- specific university's real requirements, just standard administrative
-- document types any study-abroad application needs) so new applications
-- get a real "missing" checklist automatically. See 0051 for the
-- auto-provisioning trigger.
insert into document_templates (level, destination_id, category, name, required, sort_order) values
  ('all', null, 'admission', 'Passport copy', true, 10),
  ('all', null, 'admission', 'Academic transcripts', true, 20),
  ('all', null, 'admission', 'Degree certificate', true, 30),
  ('all', null, 'admission', 'CV / Resume', true, 40),
  ('all', null, 'admission', 'Statement of Purpose', true, 50),
  ('all', null, 'admission', 'Letters of Recommendation', true, 60),
  ('all', null, 'admission', 'Language proficiency certificate', true, 70),
  ('all', null, 'admission', 'Passport-size photographs', true, 80),
  ('all', null, 'visa', 'Financial proof / bank statement', true, 90),
  ('all', null, 'visa', 'Visa application form', true, 100);
