-- One general agreement for the visa documentation service, for every
-- destination.
--
-- A visa-only client could only be given a visa-service template written for
-- their country, so the office kept one copy of the same wording per
-- destination (Italy already had two). Now a visa-service template may be for
-- "All destinations": it has no destination of its own, and whoever generates
-- the agreement says which of the student's countries it is for.
--
-- That moves where an agreement's country lives. It came from its template —
-- the PDF's fee, the finance pages, the student's Agreement page all read
-- template.destination — and a general template has none. So an agreement
-- records its own country (agreements.destination_id), filled from its
-- template's for every agreement on file and for any new one that does not
-- say, and every reader looks there first.
--
-- The visa service fee stays per destination, in its consultancy-fee currency
-- — which is EUR for the public-track countries and PKR for the private ones.
-- The office's figures are €500 for a public university and PKR 75,000 for a
-- private one, set here where no fee has been chosen yet; a destination whose
-- fee has already been set keeps it.
--
-- Only a visa-service template may be general: a full-service agreement's
-- fees, and its backup-country logic, belong to one country.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agreement_templates' and column_name = 'service_type'
  ) then
    raise exception '0298: expects agreement_templates.service_type (0279)';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'destinations' and column_name = 'visa_service_fee'
  ) then
    raise exception '0298: expects destinations.visa_service_fee (0279)';
  end if;
end $$;

-- ------------------------------------------------------------ the template
alter table public.agreement_templates alter column destination_id drop not null;

alter table public.agreement_templates drop constraint if exists agreement_templates_general_is_visa_only;
alter table public.agreement_templates
  add constraint agreement_templates_general_is_visa_only
  check (destination_id is not null or service_type = 'visa_only');

comment on column public.agreement_templates.destination_id is
  'The country this template is for. Null only on a visa-service template for all destinations (0298), whose agreements record their own country.';

-- ------------------------------------------------------------ the agreement
alter table public.agreements
  add column if not exists destination_id uuid references public.destinations (id) on delete set null;

create index if not exists agreements_destination_idx on public.agreements (destination_id);

update public.agreements a
set destination_id = t.destination_id
from public.agreement_templates t
where t.id = a.template_id
  and a.destination_id is null
  and t.destination_id is not null;

-- A country-specific template names the country, whatever the writer said;
-- a general one leaves it to the writer.
create or replace function public.agreement_destination_from_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  template_destination uuid;
begin
  if new.template_id is not null then
    select t.destination_id into template_destination from public.agreement_templates t where t.id = new.template_id;
    if template_destination is not null then
      new.destination_id := template_destination;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_agreements_destination_from_template on public.agreements;
create trigger trg_agreements_destination_from_template
  before insert or update of template_id, destination_id on public.agreements
  for each row execute function public.agreement_destination_from_template();

comment on column public.agreements.destination_id is
  'The country this agreement is for (0298): its template''s, or — for a general visa-service template — the one chosen when it was generated.';

-- ------------------------------------------------------------ the fees
update public.destinations set visa_service_fee = 500 where track = 'public' and visa_service_fee is null;
update public.destinations set visa_service_fee = 75000 where track = 'private' and visa_service_fee is null;

-- ------------------------------------------------------------ the student's view
-- The country on the student's Agreement page (0290), from the agreement now.
create or replace function public.my_agreement_countries()
returns table (agreement_id uuid, country text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, d.display_name
  from agreements a
  join leads l on l.id = a.student_id
  left join agreement_templates t on t.id = a.template_id
  left join destinations d on d.id = coalesce(a.destination_id, t.destination_id)
  where l.auth_user_id = auth.uid();
$$;

notify pgrst, 'reload schema';
