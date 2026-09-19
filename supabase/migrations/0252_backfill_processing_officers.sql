-- Give the already-registered students a processing officer.
--
-- The counselor owns a lead and the Processing Team owns a registered student,
-- but the handoff was a dropdown nobody filled: all three registered students
-- had no officer at all. Nothing failed loudly, because the deadline reminders
-- fall back to emailing the whole team for a student with none — so the work
-- was watched while nobody in particular owned it.
--
-- The application now assigns on registration (see processingHandoff.ts). This
-- catches the three that predate it. Written in SQL to the same rule the code
-- uses — fewest registered students first, ties broken by name — so a backfill
-- and a live registration cannot drift apart in who they would choose.
--
-- Leaves alone any student who already has an officer: a deliberate assignment
-- must always beat an automatic one.
with officers as (
  select s.id,
         s.full_name,
         (select count(*)
            from public.leads l
           where l.processing_officer_id = s.id
             and l.registration_status = 'registered') as students
    from public.staff s
   where s.status = 'active'
     and s.roles && array['processing']::staff_role[]
),
-- Ordered so the same rule applies as each one lands: row_number over the
-- unassigned students, dealt round the officers cheapest-first.
unassigned as (
  select l.id,
         row_number() over (order by l.registered_at, l.full_name) - 1 as n
    from public.leads l
   where l.registration_status = 'registered'
     and l.processing_officer_id is null
),
ranked as (
  select id, full_name, students,
         row_number() over (order by students, full_name) - 1 as seat,
         count(*) over () as seats
    from officers
)
update public.leads l
   set processing_officer_id = r.id
  from unassigned u
  join ranked r on r.seat = (u.n % r.seats)
 where l.id = u.id
   and l.processing_officer_id is null;
