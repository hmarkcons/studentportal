-- Social Media management module — Phase A schema (0344).
--
-- A new, self-contained module for connecting HMARK's own social accounts,
-- composing posts, scheduling them and auto-publishing to the platforms. It is
-- separate from the existing lightweight content planner at
-- /marketing/social-calendar (social_calendar_posts), which stays as it is.
--
-- Tokens are encrypted at rest with pgcrypto, reusing the Vault key the rest of
-- the portal's secrets already use (credential_encryption_key, 0012), and are
-- reachable ONLY from service-role server code (the OAuth callback and the
-- publisher) — a signed-in staff session can never read a raw token.
--
-- RLS is the coarse boundary: only the social-capable roles (super_admin,
-- management, marketing, digital_marketing) may touch these tables at all. Which
-- of them may create / schedule / approve / publish is the finer line, enforced
-- in the server actions by the social.* permissions seeded at the end — the same
-- pattern as the student-section permissions (0343), retunable in Admin › Role
-- Permissions.

-- ---------------------------------------------------------------------------
-- A boolean for "may use the Social Media module at all", written once.
-- ---------------------------------------------------------------------------
create or replace function public.is_social_staff() returns boolean
language sql stable as $$
  select has_role(array['super_admin', 'management', 'marketing', 'digital_marketing']::staff_role[]);
$$;

-- ---------------------------------------------------------------------------
-- Connected accounts
-- ---------------------------------------------------------------------------
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('facebook', 'instagram', 'threads', 'linkedin', 'tiktok', 'snapchat')),
  -- The platform's own id for the page / profile we publish to.
  external_id text not null,
  display_name text not null,
  username text,
  avatar_url text,
  -- active | token_expiring | needs_reconnect | disconnected
  status text not null default 'active' check (status in ('active', 'token_expiring', 'needs_reconnect', 'disconnected')),
  scopes text[] not null default '{}',
  -- Snapchat: the chosen Public Profile id. Others: spare for platform specifics.
  profile_ref text,
  meta jsonb not null default '{}',
  -- Marks a mock/sandbox account, so the publisher never calls a real API for it.
  is_mock boolean not null default false,
  token_expires_at timestamptz,
  connected_by uuid references public.staff(id),
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_id)
);
create index social_accounts_platform_status_idx on public.social_accounts (platform, status);

-- Tokens live in their own table, never selectable from a user session.
create table public.social_account_secrets (
  account_id uuid primary key references public.social_accounts(id) on delete cascade,
  -- pgp_sym_encrypt of a JSON blob: {access_token, refresh_token?, ...}.
  encrypted_value bytea not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ---------------------------------------------------------------------------
-- Campaigns, media library, caption templates
-- ---------------------------------------------------------------------------
create table public.social_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  unique (name)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  -- Object path inside the public 'social-media' storage bucket, and its public URL
  -- (Meta and TikTok pull media from a public URL).
  storage_path text not null,
  public_url text not null,
  kind text not null check (kind in ('image', 'video')),
  mime_type text,
  width int,
  height int,
  duration_seconds numeric,
  size_bytes bigint,
  alt_text text,
  uploaded_by uuid references public.staff(id),
  created_at timestamptz not null default now()
);

create table public.caption_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body text not null,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Posts and their per-platform targets
-- ---------------------------------------------------------------------------
create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  caption text,
  hashtags text,
  link text,
  -- Ordered media_assets ids (a carousel keeps its order).
  media_asset_ids uuid[] not null default '{}',
  -- HMARK fields.
  destination_country text,
  campaign_id uuid references public.social_campaigns(id) on delete set null,
  intake text,
  -- draft | pending_approval | scheduled | publishing | published | partially_published | failed
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'scheduled', 'publishing', 'published', 'partially_published', 'failed')),
  -- Always UTC; the UI shows Asia/Karachi.
  scheduled_at timestamptz,
  author_id uuid references public.staff(id),
  approved_by uuid references public.staff(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- The publisher sweeps due posts by (status, scheduled_at).
create index social_posts_status_scheduled_idx on public.social_posts (status, scheduled_at);

create table public.social_post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  platform text not null,
  caption_override text,
  -- Snapchat destination, TikTok privacy level, Instagram post/reel/story, etc.
  options jsonb not null default '{}',
  -- pending | publishing | published | failed
  status text not null default 'pending' check (status in ('pending', 'publishing', 'published', 'failed')),
  platform_post_id text,
  platform_post_url text,
  error text,
  attempts int not null default 0,
  -- IG / Threads / TikTok create a media container first, then publish it.
  container_id text,
  -- Cached metrics (likes/comments/…); null until fetched, {} where unavailable.
  metrics jsonb,
  metrics_fetched_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, account_id)
);
create index social_post_targets_status_idx on public.social_post_targets (status);
create index social_post_targets_post_idx on public.social_post_targets (post_id);

-- A human-readable activity timeline (created / edited / submitted / approved /
-- scheduled / published / failed), separate from the generic audit_log, which
-- is for restore. Append-only from the actions.
create table public.social_post_audit_log (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  actor_id uuid references public.staff(id),
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index social_post_audit_log_post_idx on public.social_post_audit_log (post_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security — only the social-capable roles, at all.
-- ---------------------------------------------------------------------------
alter table public.social_accounts enable row level security;
alter table public.social_account_secrets enable row level security;
alter table public.social_campaigns enable row level security;
alter table public.media_assets enable row level security;
alter table public.caption_templates enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_post_targets enable row level security;
alter table public.social_post_audit_log enable row level security;

create policy social_accounts_rw on public.social_accounts for all
  using ((select public.is_social_staff())) with check ((select public.is_social_staff()));
create policy social_campaigns_rw on public.social_campaigns for all
  using ((select public.is_social_staff())) with check ((select public.is_social_staff()));
create policy media_assets_rw on public.media_assets for all
  using ((select public.is_social_staff())) with check ((select public.is_social_staff()));
create policy caption_templates_rw on public.caption_templates for all
  using ((select public.is_social_staff())) with check ((select public.is_social_staff()));
create policy social_posts_rw on public.social_posts for all
  using ((select public.is_social_staff())) with check ((select public.is_social_staff()));
create policy social_post_targets_rw on public.social_post_targets for all
  using ((select public.is_social_staff())) with check ((select public.is_social_staff()));
-- Read-only from a session; rows are written by the actions through the service role.
create policy social_post_audit_log_read on public.social_post_audit_log for select
  using ((select public.is_social_staff()));

-- social_account_secrets: RLS on, NO policy. No session can read or write it;
-- only the service role (OAuth callback, publisher) and the definer RPCs below.

-- ---------------------------------------------------------------------------
-- Token storage — encrypted, service-role only.
-- ---------------------------------------------------------------------------
create or replace function public.store_social_token(p_account_id uuid, p_plaintext text) returns void
language plpgsql security definer as $$
declare
  v_key text;
begin
  -- Service-role callers only (the OAuth callback / refresh job). A signed-in
  -- staff session has auth.uid() set and is refused: tokens never reach a session.
  if auth.uid() is not null then
    raise exception 'not authorized';
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'credential_encryption_key';
  insert into public.social_account_secrets (account_id, encrypted_value, updated_by)
  values (p_account_id, pgp_sym_encrypt(p_plaintext, v_key), null)
  on conflict (account_id) do update set encrypted_value = excluded.encrypted_value, updated_at = now();
end;
$$;

create or replace function public.read_social_token(p_account_id uuid) returns text
language plpgsql security definer as $$
declare
  v_key text;
  v_val bytea;
begin
  if auth.uid() is not null then
    raise exception 'not authorized';
  end if;
  select encrypted_value into v_val from public.social_account_secrets where account_id = p_account_id;
  if v_val is null then
    return null;
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'credential_encryption_key';
  return pgp_sym_decrypt(v_val, v_key);
end;
$$;

revoke all on function public.store_social_token(uuid, text) from public, anon, authenticated;
revoke all on function public.read_social_token(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit (0322): restore history for the data tables. The secrets table (tokens)
-- and the append-only activity log are deliberately not audited.
-- ---------------------------------------------------------------------------
create trigger trg_audit_social_accounts after insert or update or delete on public.social_accounts
  for each row execute function public.log_audit_event('id');
create trigger trg_audit_social_campaigns after insert or update or delete on public.social_campaigns
  for each row execute function public.log_audit_event('id');
create trigger trg_audit_media_assets after insert or update or delete on public.media_assets
  for each row execute function public.log_audit_event('id');
create trigger trg_audit_caption_templates after insert or update or delete on public.caption_templates
  for each row execute function public.log_audit_event('id');
create trigger trg_audit_social_posts after insert or update or delete on public.social_posts
  for each row execute function public.log_audit_event('id');
create trigger trg_audit_social_post_targets after insert or update or delete on public.social_post_targets
  for each row execute function public.log_audit_event('id');

-- ---------------------------------------------------------------------------
-- Permissions (seeded defaults; a Super Admin retunes them in Role Permissions).
--   page.social            — see the Social Media section
--   social.accounts.manage — connect / disconnect accounts
--   social.posts.create    — create & draft posts
--   social.posts.schedule  — schedule posts
--   social.posts.approve   — approve posts awaiting approval
--   social.posts.publish   — publish now / push live
--   social.analytics.view  — see the analytics dashboard
-- Super Admin holds every permission and is never listed.
-- ---------------------------------------------------------------------------
with base as (select coalesce(max(sort_order), 0) as m from public.permission_definitions)
insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
select v.key, v.category, v.label, v.description, v.default_roles, base.m + v.ord
from base, (values
  ('page.social', 'Social Media', 'Social Media section', 'See the Social Media section (Calendar, Create Post, Posts, Media Library, Accounts, Analytics).', array['management', 'marketing', 'digital_marketing']::staff_role[], 10),
  ('social.accounts.manage', 'Social Media', 'Connect accounts', 'Connect and disconnect HMARK''s social accounts.', array['management']::staff_role[], 20),
  ('social.posts.create', 'Social Media', 'Create posts', 'Create and draft social posts.', array['management', 'marketing', 'digital_marketing']::staff_role[], 30),
  ('social.posts.schedule', 'Social Media', 'Schedule posts', 'Schedule social posts for automatic publishing.', array['management', 'marketing']::staff_role[], 40),
  ('social.posts.approve', 'Social Media', 'Approve posts', 'Approve posts that are waiting for approval.', array['management']::staff_role[], 50),
  ('social.posts.publish', 'Social Media', 'Publish posts', 'Publish a post now, or push it live to the platforms.', array['management']::staff_role[], 60),
  ('social.analytics.view', 'Social Media', 'View analytics', 'See the social analytics dashboard.', array['management', 'marketing', 'digital_marketing']::staff_role[], 70)
) as v(key, category, label, description, default_roles, ord)
on conflict (key) do update set category = excluded.category, label = excluded.label, description = excluded.description;
