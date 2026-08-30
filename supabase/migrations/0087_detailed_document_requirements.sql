-- Detailed, level- and country-aware document requirement checklist,
-- replacing the placeholder generic list from 0050 (left in place —
-- 140 real student_documents rows already reference those template ids
-- via a NO ACTION FK, so they can't be safely deleted; some overlap with
-- the new, more specific items below is an accepted tradeoff of not
-- touching live historical document-tracking data without explicit
-- confirmation).
--
-- Country groupings used below (verified against live seeded destinations,
-- 17 total: AT/FI/FR/DE/HU/IT/LU/RO/SW public; AU/CA/IE/NZ/NC/TR/UK/US
-- private):
--   european_public: AT, FI, FR, DE, HU, IT, LU, RO, SW (the 9 public destinations)
--   european: european_public + UK, IE (the 2 private-but-European ones)
--   attestation_group: european_public + AU, NZ, NC (per the user's own spec:
--     "European countries with public universities, Australia, New Zealand, TRNC")
--   travel_insurance_required: every destination EXCEPT UK, AU, US, IE, NZ, CA
--   online_visa_form_countries: UK, US, CA, IE, NZ, TR

-- ---------------------------------------------------------------------------
-- Admission (category='admission')
-- ---------------------------------------------------------------------------
insert into document_templates (level, destination_id, category, name, required, sort_order) values
  -- Applies to bachelors AND masters applicants alike (a masters applicant
  -- still needs their earlier secondary/high-school records) — level='all'.
  ('all', null, 'admission', 'Secondary school / O-Level transcript', true, 110),
  ('all', null, 'admission', 'Secondary school / O-Level certificate', true, 111),
  ('all', null, 'admission', 'High school / DAE / A-Level transcript', true, 112),
  ('all', null, 'admission', 'High school / DAE / A-Level certificate', true, 113),
  ('all', null, 'admission', 'Associate degree transcript (if applicable)', false, 114),
  ('all', null, 'admission', 'Associate degree certificate (if applicable)', false, 115),
  ('all', null, 'admission', 'Current university transcript (if applicable)', false, 116),
  -- Masters-only additions (the applicant already has a completed bachelors)
  ('masters', null, 'admission', 'Bachelor''s degree', true, 120),
  ('masters', null, 'admission', 'Bachelor''s transcript', true, 121),
  ('masters', null, 'admission', 'Letter of Recommendation (1 of 2)', true, 122),
  ('masters', null, 'admission', 'Letter of Recommendation (2 of 2)', true, 123),
  ('masters', null, 'admission', 'Grading system document', true, 124),
  ('masters', null, 'admission', 'Course description / syllabus', true, 125),
  -- Standard for every applicant regardless of level
  ('all', null, 'admission', 'Language certificate (IELTS / PTE / TOEFL / Duolingo / LangCert / IB — MOI accepted for Masters only)', true, 130),
  ('all', null, 'admission', 'Passport', true, 131),
  ('all', null, 'admission', 'CNIC', true, 132),
  ('all', null, 'admission', 'Photo', true, 133),
  ('all', null, 'admission', 'Updated CV (chronological order)', true, 134),
  ('all', null, 'admission', 'Experience letters (matching the CV)', true, 135),
  ('all', null, 'admission', 'Certifications (optional)', false, 136),
  ('all', null, 'admission', 'Internship certificates (optional)', false, 137);

-- ---------------------------------------------------------------------------
-- Attestation (category='attestation') — European public + AU/NZ/TRNC.
-- UK, Turkey, and Ireland deliberately get none seeded here (per the user's
-- own note they don't require attestation) — staff can still add one
-- manually via the existing "Add requirement" form on any student.
-- ---------------------------------------------------------------------------
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'attestation', 'IBCC attestation on secondary and high school documents', true, 210
from destinations d where d.country_code in ('AT','FI','FR','DE','HU','IT','LU','RO','SW','AU','NZ','NC');

insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'attestation', 'O-Level / A-Level equivalency certificate attested from IBCC', true, 211
from destinations d where d.country_code in ('AT','FI','FR','DE','HU','IT','LU','RO','SW','AU','NZ','NC');

insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'masters', d.id, 'attestation', 'Bachelor''s degree and transcript attested from HEC Pakistan', true, 212
from destinations d where d.country_code in ('AT','FI','FR','DE','HU','IT','LU','RO','SW','AU','NZ','NC');

-- Italy-specific extra
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'attestation', 'Apostille on all academic documents (Italy-specific requirement)', true, 220
from destinations d where d.country_code = 'IT';

-- Australia-specific extra
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'attestation', 'Legalization of all academic documents via the Austrian embassy through the Belgium embassy', true, 221
from destinations d where d.country_code = 'AU';

-- ---------------------------------------------------------------------------
-- Visa Application Requirements (category='visa')
-- ---------------------------------------------------------------------------
insert into document_templates (level, destination_id, category, name, required, sort_order) values
  ('all', null, 'visa', 'FRC', true, 310),
  ('all', null, 'visa', 'Tax returns (last 2 years)', true, 311),
  ('all', null, 'visa', 'NTN certificate', true, 312),
  ('all', null, 'visa', 'Affidavit of support from the sponsor (or self-declaration if self-sponsored)', true, 313),
  ('all', null, 'visa', 'Bank statement', true, 314),
  ('all', null, 'visa', 'Account maintenance certificate', true, 315),
  ('all', null, 'visa', 'Sponsor''s CNIC', true, 316),
  ('all', null, 'visa', 'Supporting income/asset documents, as applicable (rental agreement, stocks, fixed deposits, agricultural income, pension, retirement gratuity, or others)', false, 317),
  ('all', null, 'visa', 'Photo', true, 318),
  ('all', null, 'visa', 'Hotel booking', true, 319),
  ('all', null, 'visa', 'Air ticket reservation', true, 320),
  ('all', null, 'visa', 'Cover letter', true, 321);

-- Travel insurance: required everywhere except UK, Australia, USA, Ireland, New Zealand, Canada
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'visa', 'Travel insurance', true, 322
from destinations d where d.country_code not in ('UK','AU','US','IE','NZ','CA');

-- Visa application form: required for all European destinations (public + UK + Ireland)
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'visa', 'Visa application form', true, 323
from destinations d where d.country_code in ('AT','FI','FR','DE','HU','IT','LU','RO','SW','UK','IE');

-- Online visa application form (via Anatolia Visa Application Center for
-- Turkey) — staff uploads the filled form.
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'visa', 'Online visa application form (staff-uploaded, filled)', true, 324
from destinations d where d.country_code in ('UK','US','CA','IE','NZ','TR');

-- Country-specific visa variations
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'visa', 'Block account (Germany, public university — if used, replaces the Bank statement / Account maintenance certificate requirement above)', false, 340
from destinations d where d.country_code = 'DE';

insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'visa', 'Birth certificate (Germany, required only for private German universities — none currently seeded)', false, 341
from destinations d where d.country_code = 'DE';

insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'visa', 'Euro Bonds (Ireland — alternative to Bank statement / Account maintenance certificate)', false, 342
from destinations d where d.country_code = 'IE';

insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'visa', 'Property valuation certificate (Australia)', true, 350
from destinations d where d.country_code = 'AU';
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'visa', 'Wealth certificate (Australia)', true, 351
from destinations d where d.country_code = 'AU';
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'visa', 'Police character certificate (Australia)', true, 352
from destinations d where d.country_code = 'AU';
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'visa', 'Medical certificate from IOM (Australia)', true, 353
from destinations d where d.country_code = 'AU';

insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'visa', 'Birth certificate (UK)', true, 360
from destinations d where d.country_code = 'UK';
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'visa', 'TB test from IOM (UK)', true, 361
from destinations d where d.country_code = 'UK';
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'visa', 'Biometric appointment at VFS (UK)', true, 362
from destinations d where d.country_code = 'UK';

insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'visa', 'Online visa application form (TRNC — later printed and signed)', true, 370
from destinations d where d.country_code = 'NC';
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'visa', 'Medical certificate from Islamabad Diagnostic Center (TRNC)', true, 371
from destinations d where d.country_code = 'NC';

-- ---------------------------------------------------------------------------
-- Scholarship Documents (category='scholarship_documents') — Italy only
-- ---------------------------------------------------------------------------
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'scholarship_documents', 'FRC (Apostilled)', true, 410
from destinations d where d.country_code = 'IT';
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'scholarship_documents', 'Family Income Certificate (Apostilled)', true, 411
from destinations d where d.country_code = 'IT';
insert into document_templates (level, destination_id, category, name, required, sort_order)
select 'all', d.id, 'scholarship_documents', 'Family Property Certificate (Apostilled)', true, 412
from destinations d where d.country_code = 'IT';

-- ---------------------------------------------------------------------------
-- Visa Sticker / Travel / Enrollment — simple universal items
-- ---------------------------------------------------------------------------
insert into document_templates (level, destination_id, category, name, required, sort_order) values
  ('all', null, 'visa_sticker', 'Visa page / sticker', true, 510),
  ('all', null, 'travel', 'Confirmed air ticket', true, 610),
  ('all', null, 'enrollment', 'Proof of enrollment', true, 710);
