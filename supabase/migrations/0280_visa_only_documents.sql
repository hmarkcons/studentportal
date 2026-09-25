-- Which checklist items a visa-only client (0279) is not asked for.
--
-- The "Admission Documents" section is broader than its name: it holds the
-- statement of purpose and the recommendation letters, which are admission
-- work, but also the passport copy, the CNIC and the photographs, which the
-- visa file needs as much. So the line is drawn per item, not per section:
-- skip_for_visa_only, set on Setup → Create Doc Checklist.
--
-- Seeded for the items that exist only to win an admission. Everything else —
-- identity documents, the visa sections, and the certificates and transcripts
-- derived from the student's profile, which a study visa asks for too — is
-- still asked for. A Super Admin can change any of it.

do $$
begin
  if to_regclass('public.document_templates') is null then
    raise exception '0280: public.document_templates is missing';
  end if;
end $$;

alter table public.document_templates
  add column if not exists skip_for_visa_only boolean not null default false;

comment on column public.document_templates.skip_for_visa_only is
  'Not asked of a visa-only client (leads.service_type = visa_only): admission-only paperwork such as a statement of purpose.';

update public.document_templates
set skip_for_visa_only = true
where category = 'admission'
  and name in (
    'Statement of Purpose',
    'Letters of Recommendation',
    'Letter of Recommendation (1 of 2)',
    'Letter of Recommendation (2 of 2)',
    'Grading system document',
    'Course description / syllabus',
    'Experience letters (matching the CV)',
    'Certifications (optional)',
    'Internship certificates (optional)',
    'UNEDasiss accreditation (where the university requires it)'
  );
