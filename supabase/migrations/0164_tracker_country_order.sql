-- Somewhere to keep the order the trackers are listed in.
--
-- Setup > Document trackers listed countries alphabetically by code, which is
-- an accident of the query rather than a choice: it puts AT and DE above IT,
-- and the office works Italy first. The fields inside a tracker were already
-- orderable, but only by typing numbers into a "sort order" box on each field
-- one at a time — which is the thing being replaced by dragging.
--
-- Its own tiny table rather than a column on destinations, because a tracker
-- can exist for a country that is not a destination (there is a TEST one on
-- file), and rather than a column on tracker_definitions, because the order is
-- a property of the country and not of each of its twenty-one fields.

create table if not exists tracker_country_order (
  country_code text primary key,
  sort_order int not null,
  updated_at timestamptz not null default now()
);

alter table tracker_country_order enable row level security;

-- Same rules as the definitions themselves: any active staff member can read
-- the trackers, only Super Admin can rearrange them.
drop policy if exists "tracker_country_order_select" on tracker_country_order;
create policy "tracker_country_order_select" on tracker_country_order
  for select using (is_active_staff());

drop policy if exists "tracker_country_order_write" on tracker_country_order;
create policy "tracker_country_order_write" on tracker_country_order
  for all
  using (has_role(array['super_admin']::staff_role[]))
  with check (has_role(array['super_admin']::staff_role[]));

-- Seeded from the order the page shows today, so nothing jumps around the
-- first time it loads. Gaps of ten, so a country can be dropped between two
-- others without renumbering the rest.
insert into tracker_country_order (country_code, sort_order)
select country_code, row_number() over (order by country_code) * 10
  from (select distinct country_code from tracker_definitions) c
on conflict (country_code) do nothing;
