-- What a scholarship record said before it was translated.
--
-- Translation rewrites the fields everybody reads, which is the point — but
-- it also means the Italian a counselor copied off a bando is gone from the
-- row, and there is no way to check the translation against it afterwards.
-- This keeps only the fields that actually changed, so the record stays small
-- and readable rather than a second copy of the whole row.
alter table public.scholarship_bodies
  add column if not exists original_text jsonb,
  add column if not exists translated_at timestamptz;

comment on column public.scholarship_bodies.original_text is
  'The pre-translation text of whichever fields were translated, keyed by column name. Null where nothing has ever been translated.';
comment on column public.scholarship_bodies.translated_at is
  'When this record was last put into English automatically. Null means it never needed it.';
