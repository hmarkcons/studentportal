-- Corrections to the Italy arrival guide seeded by 0179.
--
-- Reviewed against what the process actually is, and three things in my own
-- draft were wrong in ways that cost a student money or time:
--
--   1. The DSU scholarship item sat in "Settling in", last, with no deadline,
--      saying the regional deadline is "usually early in the academic year".
--      For most Italian regions applications CLOSE IN THE SUMMER, before the
--      student flies. A student arriving in September and reading that would
--      conclude they had time, and miss the single largest sum of money in
--      the whole process. It moves to "Before you leave Pakistan", first, and
--      says so plainly.
--
--   2. "within eight days" for the permesso di soggiorno. The law is eight
--      WORKING days from entry. The tracked deadline stays at 8 so the nag
--      remains conservative, but the wording no longer understates it — a
--      student corrected on this at the post office loses confidence in
--      everything else on the page.
--
--   3. The codice fiscale item sent everyone to the Agenzia delle Entrate as
--      step one. Many students arriving on a study visa already have one,
--      issued with the visa or at the permesso appointment. An unnecessary
--      trip across a strange city in week one is not a small thing.
--
-- Also: only the permesso deadline is law. The 14- and 30-day markers on
-- university registration, the bank account and health cover are this
-- office's prompts, and the section now says which is which — a student who
-- thinks they have broken a rule by opening an account on day 35 has been
-- frightened for nothing.
--
-- Every update below is guarded on the text 0179 seeded, so it changes
-- nothing the office has since edited itself, and re-running it is a no-op.

-- 1. The scholarship deadline, moved and rewritten.
update public.travel_guide_items i
set section_id = (
      select s2.id
      from public.travel_guide_sections s2
      join public.travel_guide_sections s1 on s1.destination_id = s2.destination_id
      where s1.id = i.section_id and s2.title = 'Before you leave Pakistan'
      limit 1
    ),
    sort_order = 5,
    label = 'Apply for your DSU regional scholarship — check the deadline now',
    detail = 'Most Italian regions close applications in the summer, BEFORE you fly, and some want the application in before you even have your permesso. If you have not applied, tell your counsellor today. This is the largest amount of money in the whole process and it is the one thing on this page that cannot be done late.',
    days_after_arrival = null,
    updated_at = now()
where i.label = 'Apply for your DSU scholarship if you have not already'
  and i.detail = 'Check the deadline for your region — it is usually early in the academic year.'
  and exists (
    select 1
    from public.travel_guide_sections s
    join public.destinations d on d.id = s.destination_id
    where s.id = i.section_id and lower(btrim(d.country)) = 'italy'
  );

-- 2. Eight working days, not eight days.
update public.travel_guide_items
set detail = 'The residence permit. Submit the kit at a Poste Italiane Sportello Amico within eight working days of arriving. This one is the law, not our advice — and the post office will give you an appointment letter for the questura afterwards, which you must attend in person for fingerprints.',
    updated_at = now()
where label = 'Apply for your permesso di soggiorno'
  and detail = 'The residence permit. Submit the kit at a Poste Italiane Sportello Amico within eight days of arriving — this one is not flexible.';

-- 3. Check before you queue.
update public.travel_guide_items
set detail = 'Your tax code. Check your visa paperwork first — you may already have one, and it is often issued at the permesso appointment too. Only go to the Agenzia delle Entrate if you do not have it. Almost nothing else can be done without it.',
    updated_at = now()
where label = 'Get your codice fiscale'
  and detail = 'Your tax code, from the Agenzia delle Entrate. Almost nothing else can be done without it.';

-- 4. Which deadline is law and which is us.
update public.travel_guide_sections
set intro = 'Only the permesso di soggiorno deadline is set by Italian law. The other dates here are our own advice on a sensible order — you are not in trouble if one slips, but starting them late is the commonest problem our students hit.',
    updated_at = now()
where title = 'In your first week in Italy'
  and intro = 'These have deadlines. Starting them late is the most common problem students hit.';
