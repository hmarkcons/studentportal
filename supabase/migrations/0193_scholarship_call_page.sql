-- The page a region publishes its call on, as distinct from the PDF.
--
-- 0175 gave every body a call_pdf_url, on the assumption that a call is a
-- document you can link to. Most Italian regions do not publish it that way:
-- the bando goes up on a page with its annexes, the ISEE forms and the
-- deadlines table beside it, and there is no single file worth pointing a
-- student at — or the file is one of eight on that page.
--
-- Two fields rather than one because they answer different questions, and
-- downloadScholarshipCall can only ever work on the first: call_pdf_url is
-- fetched and parsed as a PDF, so a page address in it fails the fetch. This
-- one is only ever opened by a person.
alter table public.scholarship_bodies
  add column if not exists call_page_url text;

comment on column public.scholarship_bodies.call_page_url is
  'The page on the region''s site where the call for applications is published, for when there is no single PDF to link. Opened by a person; never fetched.';
