-- Adding or confirming an interview failed outright: the alert trigger 0320
-- put on application_interviews read new.university_name, a column 0151 had
-- dropped, so every insert and every change of confirmed_datetime raised
-- 'record "new" has no field "university_name"' and was refused.
--
-- The university comes from the application, as the rest of the trigger
-- already read it. The migration then proves an interview can be added again,
-- inside a block it rolls back.

create or replace function public.notifications_on_interview() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid;
  v_uni text;
begin
  select a.student_id, coalesce(nullif(btrim(u.name), ''), 'the university') into v_student, v_uni
  from applications a left join universities u on u.id = a.university_id
  where a.id = new.application_id;
  v_uni := coalesce(v_uni, 'the university');
  if tg_op = 'INSERT' then
    perform notify(notify_student_user(v_student), 'interview', 'interview:' || new.id,
      'Interview arranged with ' || v_uni, null, 'See the details under Appointments.', '/portal/appointments', null, v_student, true, true);
  elsif new.confirmed_datetime is not null and new.confirmed_datetime is distinct from old.confirmed_datetime then
    perform notify(notify_student_user(v_student), 'interview', 'interview:' || new.id,
      'Interview confirmed with ' || v_uni,
      null, to_char(new.confirmed_datetime at time zone 'Asia/Karachi', 'FMDD Mon YYYY, FMHH12:MI AM') || ' (Pakistan time)',
      '/portal/appointments', null, v_student, true, true);
  end if;
  return null;
end;
$$;

do $$
declare
  app uuid;
  iv uuid;
begin
  select id into app from public.applications limit 1;
  if app is null then
    return;
  end if;
  begin
    insert into public.application_interviews (application_id, status) values (app, 'scheduled') returning id into iv;
    update public.application_interviews set confirmed_datetime = now() + interval '1 day' where id = iv;
    raise exception using errcode = 'P0001', message = '0323 proven';
  exception when raise_exception then
    if sqlerrm <> '0323 proven' then
      raise;
    end if;
  end;
end $$;
