-- HMARK CRM rebuild — step 17: the fuller partner dashboard needs each
-- application's program deadline ("Upcoming Intake Deadlines" per Module 3B),
-- which get_partner_applications() didn't expose yet.
-- Run after 0020_partner_applications_pipeline_stages.sql.

drop function get_partner_applications();

create or replace function get_partner_applications() returns table (
  application_id uuid,
  student_name text,
  program_name text,
  intake text,
  current_stage text,
  pipeline_stages jsonb,
  submitted_at timestamptz,
  application_deadline date,
  student_email text,
  student_phone text,
  documents_summary jsonb
) language plpgsql security definer as $$
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
    p.application_deadline,
    case when v_mode = 'full' then l.email else null end,
    case when v_mode = 'full' then l.contact_number else null end,
    (
      select jsonb_object_agg(coalesce(sd.category, 'other'), sd.status)
      from student_documents sd
      where sd.application_id = a.id
    )
  from applications a
  join leads l on l.id = a.student_id
  join universities u2 on u2.id = a.university_id
  join destinations d on d.id = u2.destination_id
  left join programs p on p.id = a.program_id
  where a.university_id = v_uni;
end;
$$;

grant execute on function get_partner_applications() to authenticated;
