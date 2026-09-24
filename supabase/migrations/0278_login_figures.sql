-- The figures on the login screen — "15 Years Experience", "7500+
-- Admissions" and the rest — kept where a Super Admin can change them as they
-- grow, on Setup → Login screen, rather than in the code.
--
-- The login page is public; it reads these through the server's cache
-- (getCachedLoginFigures, service role), so the table itself is readable only
-- by active staff, for the Setup page. Writing is for whoever may open that
-- page: page.setup.login_screen, added here with no default roles, so a
-- Super Admin only until they grant it on Role Permissions.
--
-- Seeded with the office's figures of 2026-09-25, once: a re-run leaves
-- whatever has been edited since.

do $$
begin
  if to_regprocedure('public.staff_has_permission(text)') is null then
    raise exception '0278: public.staff_has_permission(text) is missing';
  end if;
  if to_regclass('public.permission_definitions') is null then
    raise exception '0278: public.permission_definitions is missing (0094)';
  end if;
end $$;

create table if not exists public.login_figures (
  id uuid primary key default gen_random_uuid(),
  sort_order integer not null,
  value text not null check (char_length(value) between 1 and 12),
  label text not null check (char_length(label) between 1 and 40),
  icon text not null default 'star'
    check (icon in ('years', 'universities', 'programs', 'admissions', 'visa', 'star')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff (id) on delete set null
);

comment on table public.login_figures is
  'The figures shown on the login screen, in sort_order. Edited on Setup → Login screen (page.setup.login_screen).';

alter table public.login_figures enable row level security;

drop policy if exists "login_figures_select" on public.login_figures;
create policy "login_figures_select" on public.login_figures for select
  using (is_active_staff());

drop policy if exists "login_figures_write" on public.login_figures;
create policy "login_figures_write" on public.login_figures for all
  using (public.staff_has_permission('page.setup.login_screen'))
  with check (public.staff_has_permission('page.setup.login_screen'));

insert into public.login_figures (sort_order, value, label, icon)
select v.sort_order, v.value, v.label, v.icon
from (values
  (1, '15', 'Years Experience', 'years'),
  (2, '1000+', 'Universities', 'universities'),
  (3, '1000+', 'Programs', 'programs'),
  (4, '7500+', 'Admissions', 'admissions'),
  (5, '97%', 'Visa Success', 'visa')
) as v(sort_order, value, label, icon)
where not exists (select 1 from public.login_figures);

insert into public.permission_definitions (key, category, label, description, default_roles, sort_order) values
  ('page.setup.login_screen', 'Menu & page access', 'Open Setup → Login screen', 'See Login screen under Setup and change the figures shown on the login page.', array[]::staff_role[], 127)
on conflict (key) do nothing;
