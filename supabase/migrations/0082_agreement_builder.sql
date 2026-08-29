-- Agreement builder: super admin authors/edits the actual agreement wording
-- in-app (instead of it being hardcoded per-country in
-- src/lib/pdf/agreementContent.ts), with merge-field placeholders substituted
-- per student at generation time. Multiple templates per destination are now
-- supported (e.g. different wording variants), so templates need a name to
-- distinguish them in the generation picker.

alter table agreement_templates
  add column if not exists name text not null default 'Standard',
  add column if not exists wording text not null default '';

-- file_path was "the uploaded reference copy" and required at creation, but
-- wording can now be typed/pasted directly with no file involved at all.
alter table agreement_templates alter column file_path drop not null;

-- agreement_templates_write was is_active_staff() (any active staff role),
-- but per the feature's own requirement only Super Admin edits templates —
-- read access for staff picking a template to generate stays broad.
drop policy if exists "agreement_templates_write" on agreement_templates;
create policy "agreement_templates_write" on agreement_templates for all
  using (has_role(array['super_admin']::staff_role[]))
  with check (has_role(array['super_admin']::staff_role[]));
