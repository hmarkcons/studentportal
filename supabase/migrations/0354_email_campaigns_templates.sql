-- Email campaigns, part 1: templates (the brief in reference/Email Marketing).
--
-- Staff upload a ready-made email — one .html file, or a .zip holding
-- index.html with its images and stylesheets — and the portal makes it
-- sendable: scripts, forms and frames taken out, images pointed at their
-- public addresses, the CSS written onto the elements, an unsubscribe footer
-- added if the email has none, a plain-text version made, and a pre-flight
-- checklist run. Each upload is a version of a template; re-uploading makes
-- the next version and keeps the earlier ones.
--
-- Every table here is prefixed email_: "campaigns" is already the offline
-- events (and leads.campaign_id points at it).
--
-- Nothing is sent in bulk yet. The sending service (Amazon SES recommended)
-- is bought and connected later; email_settings.provider stays 'none' until
-- then, and a test email goes out through the portal's own mailbox.
--
-- Who may do what (seeded defaults, retuned in Admin › Role Permissions;
-- a Super Admin holds every permission):
--   page.marketing.email   — open Marketing › Email campaigns
--   email.templates.manage — upload, edit, duplicate, archive templates; send tests
--   email.settings.manage  — change the email settings (Super Admin only to begin with)

-- 1 ---------------------------------------------------------------- settings
create table if not exists public.email_settings (
  id boolean primary key default true,
  -- The sending service: 'none' until one is bought and its keys are set.
  provider text not null default 'none' check (provider in ('none', 'ses', 'resend')),
  from_name text not null default 'HMARK Consultants',
  from_email text,
  reply_to text,
  -- Printed in the footer every campaign email carries.
  physical_address text not null
    default 'Suite 101, Dashtiyar Chambers, University Road, Gulshan-e-Iqbal, Block 13-C, Karachi, Pakistan',
  -- The largest template upload, in MB.
  max_upload_mb integer not null default 20 check (max_upload_mb between 1 and 40),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint email_settings_singleton check (id),
  constraint email_settings_from_email check (from_email is null or from_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint email_settings_reply_to check (reply_to is null or reply_to ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint email_settings_address check (btrim(physical_address) <> '')
);
insert into public.email_settings (id) values (true) on conflict do nothing;

drop trigger if exists trg_email_settings_updated_at on public.email_settings;
create trigger trg_email_settings_updated_at before update on public.email_settings
  for each row execute function set_updated_at();

comment on table public.email_settings is 'Email campaign settings (0354): the sending service, sender, footer address, upload limit.';

-- 2 ---------------------------------------------------------------- templates
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  current_version_id uuid,
  archived_at timestamptz,
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.email_templates (id) on delete cascade,
  version integer not null check (version >= 1),
  source_kind text not null check (source_kind in ('html', 'zip', 'copy')),
  source_name text,
  -- Ready to send, merge tags intact.
  html text not null,
  -- The plain-text version, made from the HTML and editable.
  text_body text not null default '',
  -- What was taken out for email clients: [{what, count, why}].
  removed jsonb not null default '[]'::jsonb,
  -- The pre-flight checklist: [{key, label, status, detail, items?}].
  preflight jsonb not null default '[]'::jsonb,
  -- What in the zip was set aside: [{path, reason}].
  ignored jsonb not null default '[]'::jsonb,
  size_bytes integer not null default 0,
  merge_tags text[] not null default '{}',
  footer_added boolean not null default false,
  asset_count integer not null default 0,
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);
create index if not exists email_template_versions_template on public.email_template_versions (template_id, version desc);

alter table public.email_templates
  drop constraint if exists email_templates_current_version_fkey;
alter table public.email_templates
  add constraint email_templates_current_version_fkey
  foreign key (current_version_id) references public.email_template_versions (id) on delete set null;

-- The images and fonts an uploaded template carries, in the public email-assets bucket.
create table if not exists public.email_assets (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.email_template_versions (id) on delete cascade,
  -- Its path in the upload ("images/logo.png") and where it is stored.
  source_path text not null,
  storage_path text not null,
  public_url text not null,
  mime text not null,
  bytes integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists email_assets_version on public.email_assets (version_id);

drop trigger if exists trg_email_templates_updated_at on public.email_templates;
create trigger trg_email_templates_updated_at before update on public.email_templates
  for each row execute function set_updated_at();

-- 3 ---------------------------------------------------------------- who may
alter table public.email_settings enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_template_versions enable row level security;
alter table public.email_assets enable row level security;

drop policy if exists email_settings_read on public.email_settings;
create policy email_settings_read on public.email_settings for select
  using ((select public.staff_has_permission('page.marketing.email')));
drop policy if exists email_settings_write on public.email_settings;
create policy email_settings_write on public.email_settings for update
  using ((select public.staff_has_permission('email.settings.manage')))
  with check ((select public.staff_has_permission('email.settings.manage')));

drop policy if exists email_templates_read on public.email_templates;
create policy email_templates_read on public.email_templates for select
  using ((select public.staff_has_permission('page.marketing.email')));
drop policy if exists email_templates_write on public.email_templates;
create policy email_templates_write on public.email_templates for all
  using ((select public.staff_has_permission('email.templates.manage')))
  with check ((select public.staff_has_permission('email.templates.manage')));

drop policy if exists email_template_versions_read on public.email_template_versions;
create policy email_template_versions_read on public.email_template_versions for select
  using ((select public.staff_has_permission('page.marketing.email')));
drop policy if exists email_template_versions_write on public.email_template_versions;
create policy email_template_versions_write on public.email_template_versions for all
  using ((select public.staff_has_permission('email.templates.manage')))
  with check ((select public.staff_has_permission('email.templates.manage')));

drop policy if exists email_assets_read on public.email_assets;
create policy email_assets_read on public.email_assets for select
  using ((select public.staff_has_permission('page.marketing.email')));
drop policy if exists email_assets_write on public.email_assets;
create policy email_assets_write on public.email_assets for all
  using ((select public.staff_has_permission('email.templates.manage')))
  with check ((select public.staff_has_permission('email.templates.manage')));

-- 4 ---------------------------------------------------------------- history
drop trigger if exists trg_audit_email_settings on public.email_settings;
create trigger trg_audit_email_settings after insert or update or delete on public.email_settings
  for each row execute function public.log_audit_event('id');
drop trigger if exists trg_audit_email_templates on public.email_templates;
create trigger trg_audit_email_templates after insert or update or delete on public.email_templates
  for each row execute function public.log_audit_event('id');
drop trigger if exists trg_audit_email_template_versions on public.email_template_versions;
create trigger trg_audit_email_template_versions after insert or update or delete on public.email_template_versions
  for each row execute function public.log_audit_event('id');
drop trigger if exists trg_audit_email_assets on public.email_assets;
create trigger trg_audit_email_assets after insert or update or delete on public.email_assets
  for each row execute function public.log_audit_event('id');

-- 5 ---------------------------------------------------------------- the images
-- Public: an email client loads them with no login. Written only by those who
-- manage templates; an image is never removed while an email may still show it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'email-assets', 'email-assets', true, 10485760,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/x-icon',
        'font/woff', 'font/woff2', 'font/ttf', 'font/otf', 'application/vnd.ms-fontobject']
)
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "email_assets_objects_insert" on storage.objects;
create policy "email_assets_objects_insert" on storage.objects for insert
  with check (bucket_id = 'email-assets' and (select public.staff_has_permission('email.templates.manage')));
drop policy if exists "email_assets_objects_select" on storage.objects;
create policy "email_assets_objects_select" on storage.objects for select
  using (bucket_id = 'email-assets' and (select public.staff_has_permission('page.marketing.email')));
drop policy if exists "email_assets_objects_delete" on storage.objects;
create policy "email_assets_objects_delete" on storage.objects for delete
  using (bucket_id = 'email-assets' and (select public.staff_has_permission('email.templates.manage')));

-- 6 ---------------------------------------------------------------- permissions
with base as (select coalesce(max(sort_order), 0) as m from public.permission_definitions)
insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
select v.key, v.category, v.label, v.description, v.default_roles, base.m + v.ord
from base, (values
  ('page.marketing.email', 'Menu & page access', 'Open Marketing → Email campaigns', 'See Email campaigns under Marketing and open it.', array['management', 'marketing', 'digital_marketing']::staff_role[], 10),
  ('email.templates.manage', 'Email campaigns', 'Manage email templates', 'Upload, edit, duplicate and archive email templates, and send test emails.', array['marketing', 'digital_marketing']::staff_role[], 20),
  ('email.settings.manage', 'Email campaigns', 'Email settings', 'Change the email settings: the sending service, the sender, the footer address and the upload limit.', array[]::staff_role[], 30)
) as v(key, category, label, description, default_roles, ord)
on conflict (key) do update set category = excluded.category, label = excluded.label, description = excluded.description;

notify pgrst, 'reload schema';
