-- A design for each agreement template: the page, fonts, colours, headings,
-- bullets, tables, payment chart and letterhead set in the template builder's
-- "Page & theme" panel (src/lib/pdf/agreementTheme.ts).
--
-- Null is the Classic look — exactly how every agreement printed before a
-- template could be styled — so adding the column changes nothing that has
-- already been issued: each template keeps printing as it does until a Super
-- Admin gives it a design. The same for staff agreement templates (0271).
--
-- What is stored is a complete theme, already checked by normalizeTheme() on
-- save; the constraint only keeps out anything that is not an object.

do $$
begin
  if to_regclass('public.agreement_templates') is null then
    raise exception '0281: public.agreement_templates is missing';
  end if;
  if to_regclass('public.staff_agreement_templates') is null then
    raise exception '0281: public.staff_agreement_templates is missing (0271)';
  end if;
end $$;

alter table public.agreement_templates add column if not exists design jsonb;
alter table public.staff_agreement_templates add column if not exists design jsonb;

alter table public.agreement_templates drop constraint if exists agreement_templates_design_object;
alter table public.agreement_templates
  add constraint agreement_templates_design_object check (design is null or jsonb_typeof(design) = 'object');

alter table public.staff_agreement_templates drop constraint if exists staff_agreement_templates_design_object;
alter table public.staff_agreement_templates
  add constraint staff_agreement_templates_design_object check (design is null or jsonb_typeof(design) = 'object');

comment on column public.agreement_templates.design is
  'The agreement''s look (agreementTheme.ts Theme); null prints the Classic look.';
comment on column public.staff_agreement_templates.design is
  'The staff agreement''s look (agreementTheme.ts Theme); null prints the Classic look.';
