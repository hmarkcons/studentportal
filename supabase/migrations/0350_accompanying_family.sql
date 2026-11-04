-- A student's accompanying family — spouse(s) and children (0350).
--
-- Some countries (Sweden and Finland to begin with) let a student bring a
-- spouse and children, and the office charges a consultancy fee for each:
-- €500 a spouse and €250 a child as standard. Three places carry it:
--
--   destinations  whether the country allows family to accompany
--                 (allows_dependants), and its standard fee per spouse and
--                 per child, in the country's fee currency. Set in Setup.
--   leads         the family the student registered with — how many spouses
--                 and children — and, when staff changed them for this one
--                 student, the fees agreed (null = the country's standard).
--   agreements    the family and fees as they stood when the agreement was
--                 made, so a signed agreement never changes when the
--                 registration or the country's fees do later. The agreement
--                 PDF adds them to the payment chart, spread over the
--                 instalments, and the invoice is pre-filled with them.
--
-- leads and agreements are audited already (0322); their new columns are
-- covered. Nothing here is personal, so nothing is withheld.

alter table public.destinations
  add column if not exists allows_dependants boolean not null default false,
  add column if not exists spouse_fee numeric(12, 2) not null default 500 check (spouse_fee >= 0),
  add column if not exists child_fee numeric(12, 2) not null default 250 check (child_fee >= 0);

-- The two the office named. Any other is switched on in Setup.
update public.destinations set allows_dependants = true where lower(trim(country)) in ('sweden', 'finland');

alter table public.leads
  add column if not exists spouse_count smallint not null default 0 check (spouse_count between 0 and 4),
  add column if not exists children_count smallint not null default 0 check (children_count between 0 and 10),
  add column if not exists spouse_fee numeric(12, 2) check (spouse_fee >= 0),
  add column if not exists child_fee numeric(12, 2) check (child_fee >= 0);

alter table public.agreements
  add column if not exists spouse_count smallint not null default 0 check (spouse_count between 0 and 4),
  add column if not exists children_count smallint not null default 0 check (children_count between 0 and 10),
  add column if not exists spouse_fee numeric(12, 2) check (spouse_fee >= 0),
  add column if not exists child_fee numeric(12, 2) check (child_fee >= 0);
