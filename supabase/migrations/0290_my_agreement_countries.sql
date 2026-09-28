-- The country each of a student's own agreements is for.
--
-- The student's Agreement page groups their signed copies by country, so a
-- corrected Italy agreement reads as replacing the earlier Italy one and a
-- backup country's stays separate. The country lives on the template, and
-- agreement_templates is staff-only (0010) — rightly: it holds every
-- template's wording. So the page could not name the country and headed every
-- group "Your agreement".
--
-- This returns the country name and nothing else, for the caller's own
-- agreements only; the templates stay closed.

create or replace function public.my_agreement_countries()
returns table (agreement_id uuid, country text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, d.display_name
  from agreements a
  join leads l on l.id = a.student_id
  left join agreement_templates t on t.id = a.template_id
  left join destinations d on d.id = t.destination_id
  where l.auth_user_id = auth.uid();
$$;

revoke all on function public.my_agreement_countries() from public, anon;
grant execute on function public.my_agreement_countries() to authenticated;

comment on function public.my_agreement_countries is
  'The destination name of each agreement belonging to the calling student — for the student Agreement page, without opening agreement_templates (0290).';

notify pgrst, 'reload schema';
