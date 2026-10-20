-- A requirement for public universities only, or private universities only
-- (0337).
--
-- Set in Setup > Create Doc Checklist beside "Applies to" (the level), on any
-- section of any checklist, the All-destinations one included. A student is
-- asked for it when they are on that track in the country it belongs to
-- (studentTracks, documentChecklist.ts): when they are applying to a
-- university of that kind there, or — before they have any application there —
-- when that country's own track is that kind. So a private-only requirement on
-- Italy (Public) is asked of the student applying to a private university in
-- Italy, and of nobody else.
--
-- 'all', the default, is every requirement as it was: nothing already on the
-- checklist changes.

alter table public.document_templates
  add column if not exists university_track text not null default 'all';

alter table public.document_templates
  drop constraint if exists document_templates_university_track;
alter table public.document_templates
  add constraint document_templates_university_track check (university_track in ('all', 'public', 'private'));

comment on column public.document_templates.university_track is
  'all, or public / private: asked only of a student applying to a university of that kind in this country, or, before any application there, when the country''s own track is that kind (0337).';
