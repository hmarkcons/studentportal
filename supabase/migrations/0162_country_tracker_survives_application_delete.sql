-- Deleting an application could wipe a whole country's documentation tracker.
--
-- The tracker is per country: one card on the registered student's dashboard,
-- with the answers stored in application_country_extra against a single
-- application — "that country's first application", chosen by created_at, for
-- the foreign key's sake. The answers describe the country, not that
-- application.
--
-- application_country_extra.application_id is ON DELETE CASCADE, so deleting
-- that first application takes the country's tracker with it. On production
-- today: five students have two or three applications in one country, and one
-- of them has 21 tracker answers anchored to the earliest. Deleting that
-- application — available to Management and Super Admin, and an ordinary thing
-- to do when a university is dropped — would destroy all 21 without a word,
-- and the dashboard would silently re-anchor to the next application and show
-- an empty tracker. Nothing would suggest anything had been lost.
--
-- So the answers move instead. Before an application is deleted, any tracker
-- answers on it are handed to the next surviving application for the same
-- student and country, which is exactly the one the dashboard will anchor to
-- next. If there is no other application in that country, the country's
-- tracker has nothing left to describe and the cascade is correct.

create or replace function move_country_tracker_before_application_delete() returns trigger
language plpgsql security definer as $$
declare
  v_country uuid;
  v_heir uuid;
begin
  -- Nothing to rescue.
  if not exists (select 1 from application_country_extra e where e.application_id = old.id) then
    return old;
  end if;

  select u.destination_id into v_country from universities u where u.id = old.university_id;
  if v_country is null then
    return old;
  end if;

  -- The same rule the dashboard uses to pick a country's tracker: earliest
  -- application first. So the answers land where they will be read.
  select a.id into v_heir
    from applications a
    join universities u on u.id = a.university_id
   where a.student_id = old.student_id
     and u.destination_id = v_country
     and a.id <> old.id
   order by a.created_at asc, a.id asc
   limit 1;

  if v_heir is null then
    return old;
  end if;

  -- A key the heir already holds keeps the heir's value: it is the row the
  -- dashboard has been showing, so it is the one somebody last saw and edited.
  delete from application_country_extra e
   where e.application_id = old.id
     and exists (
       select 1 from application_country_extra h
        where h.application_id = v_heir and h.field_key = e.field_key
     );

  update application_country_extra
     set application_id = v_heir
   where application_id = old.id;

  return old;
end; $$;

drop trigger if exists trg_move_country_tracker_before_application_delete on applications;
create trigger trg_move_country_tracker_before_application_delete
  before delete on applications
  for each row execute function move_country_tracker_before_application_delete();
