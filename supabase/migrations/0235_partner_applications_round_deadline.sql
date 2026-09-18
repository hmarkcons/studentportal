-- Give partners the deadline their application is actually working to.
--
-- get_partner_applications returned p.application_deadline — the programme's
-- catalogue date, which since 0232 is only a MIRROR OF THE FIRST ROUND. So a
-- partner university looking at "Upcoming intake deadlines" saw round one's
-- date for every application, whichever round it was filed against.
--
-- The consequence is worse than a wrong date on screen. The dashboard filters
-- that list to dates still in the future, and the first round's date has
-- usually passed by the time a later round is being worked — so those
-- applications did not show a wrong deadline, they DROPPED OUT OF THE LIST
-- entirely. The partner's view of what was due went quiet precisely when
-- something was due.
--
-- The date now follows the same three-step chain the rest of the application
-- uses (src/lib/applicationDeadline.ts): the deadline a person typed for this
-- student, then the chosen round's closing date, then the programme's
-- catalogue date as a last resort.
--
-- round_label comes with it, so a partner can tell two applications for one
-- programme apart — since 0234 a student can hold one per round.
--
-- Dropped and recreated rather than replaced, because CREATE OR REPLACE
-- cannot change a function's return type. The grants are restated afterwards;
-- PUBLIC would get EXECUTE by default anyway, but relying on a default for
-- something a partner's whole dashboard depends on is not worth the saving.

drop function if exists public.get_partner_applications();

create function public.get_partner_applications()
returns table (
  application_id uuid,
  student_name text,
  program_name text,
  intake text,
  current_stage text,
  pipeline_stages jsonb,
  submitted_at timestamp with time zone,
  application_deadline date,
  round_label text,
  student_email text,
  student_phone text,
  documents_summary jsonb
)
language plpgsql
security definer
as $function$
declare
  v_uni uuid;
  v_mode text;
begin
  v_uni := partner_university_id();
  if v_uni is null then
    return;
  end if;
  select u.student_visibility_mode into v_mode from universities u where u.id = v_uni;

  return query
  select
    a.id,
    l.full_name,
    p.name,
    a.intake,
    a.current_stage,
    d.pipeline_stages,
    a.created_at,
    -- The application's own date, then its round's, then the programme's.
    coalesce(a.deadline, r.application_deadline, p.application_deadline),
    r.label,
    case when v_mode = 'full' then l.email else null end,
    case when v_mode = 'full' then l.contact_number else null end,
    (
      select jsonb_agg(
               jsonb_build_object(
                 'name', coalesce(nullif(btrim(sd.custom_name), ''), t.name, replace(coalesce(sd.category, 'other'), '_', ' ')),
                 'status', sd.status,
                 'uploaded_at', sd.uploaded_at,
                 'uploaded_by_role', sd.uploaded_by_role,
                 'verified_at', sd.verified_at
               )
               -- Unfilled requirements sort to the end: they have no upload
               -- time, and putting them at the top with the oldest documents
               -- would read as though they were the first to arrive.
               order by coalesce(sd.uploaded_at, 'infinity'::timestamptz), sd.id
             )
      from student_documents sd
      left join document_templates t on t.id = sd.template_id
      where sd.application_id = a.id
    )
  from applications a
  join leads l on l.id = a.student_id
  join universities u2 on u2.id = a.university_id
  join destinations d on d.id = u2.destination_id
  left join programs p on p.id = a.program_id
  left join program_intake_rounds r on r.id = a.round_id
  where a.university_id = v_uni;
end;
$function$;

grant execute on function public.get_partner_applications() to anon, authenticated, service_role;
