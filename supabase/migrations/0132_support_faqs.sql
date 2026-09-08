-- Make the portal's support FAQ editable instead of hardcoded.
--
-- The three entries lived in an array in the Support page, so correcting an
-- answer meant a code change and a deploy — including the one that tells
-- students appointments cannot be self-rescheduled, which is exactly the kind
-- of statement that goes out of date.
--
-- Seeded with the existing three so nothing disappears from the portal on the
-- deploy that stops reading the array.

create table if not exists support_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  -- Lets staff draft an answer, or retire a stale one, without deleting it.
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_support_faqs_updated_at on support_faqs;
create trigger trg_support_faqs_updated_at
  before update on support_faqs
  for each row execute function set_updated_at();

alter table support_faqs enable row level security;

-- Students read the FAQ, so SELECT is open to any authenticated user — same as
-- document_templates, which is also reference content rather than anyone's
-- data. Unpublished rows are filtered by the page, not by RLS: staff need to
-- see their own drafts.
drop policy if exists "support_faqs_select" on support_faqs;
create policy "support_faqs_select" on support_faqs
  for select using (auth.role() = 'authenticated');

drop policy if exists "support_faqs_write" on support_faqs;
create policy "support_faqs_write" on support_faqs
  for all using (is_active_staff()) with check (is_active_staff());

insert into support_faqs (question, answer, sort_order)
select * from (values
  (
    'How do I upload a document?',
    'Open the application card on your dashboard and use the Upload button next to the document.',
    10
  ),
  (
    'When does my portal activate?',
    'As soon as your signed agreement is uploaded by the HMARK team.',
    20
  ),
  (
    'How do I reschedule an appointment?',
    'Contact your counsellor via Messages, phone, or by visiting the office — there is no self-service reschedule yet.',
    30
  )
) as seed(question, answer, sort_order)
where not exists (select 1 from support_faqs);
