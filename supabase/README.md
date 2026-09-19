# Database

The schema for the HMARK Student Portal CRM: 250 migrations in `migrations/`,
93 tables, row-level security enabled on every one of them.

## Applying a migration

There is no Supabase CLI setup here and no migration-tracking table — a
migration is applied by running its SQL once, by hand, and the file is the
record that it happened. Two ways, whichever is to hand:

- **Supabase dashboard** → SQL Editor → New query → paste the file → Run.
- **From the repo**, which is what the numbered files above were applied with:

  ```powershell
  $env:PGPASSWORD = '<database password>'
  node scratch/apply-mig-env.mjs supabase/migrations/0250_drop_staff_pay_columns.sql
  ```

  PowerShell rather than bash so the password never reaches a command line.
  The runner tries the direct host first and falls back to the session-mode
  pooler, printing which it used — the direct host is IPv6-only and is not
  always reachable.

Dry-run anything destructive first by wrapping it in `begin; … rollback;` in
the SQL editor. Several migrations here were developed that way, and the ones
that drop columns refuse to run unless their data has demonstrably been copied
elsewhere (see `0250`).

## Setting up from nothing

Run every migration in order, `0001` upwards. Do not start at a later number:
the sequence is not a set of independent patches.

`0001`–`0004` build an earlier schema — the product was called "Case Flow" then
— and `0005` tears it down before the current one is built. They stay in the
sequence because running it from the beginning is what reproduces the database,
but nothing they define survives, so do not read `0001_init.sql` as the data
model.

## Staff accounts

A staff member is an auth user plus a `staff` row. Create the user under
**Authentication → Users → Add user**, then:

```sql
insert into staff (id, full_name, role)
values ('<the user''s UUID from Authentication > Users>', 'Ayesha Khan', 'counselor');
```

Without a `staff` row they can sign in and see nothing — RLS has no row to match
them against, which looks like a broken portal rather than a missing account.

`role` alone is enough. Since `0247` a staff member can hold several roles and
`staff.roles` is the authority, but a trigger fills it from `role` on insert, so
the statement above yields `roles = {counselor}` and `role = counselor`. Give
more than one role through **Admin → Staff Management**, not by hand: the rules
about who may grant what — Super Admin only for Super Admin, and never nobody —
live in `set_staff_roles()` (`0248`).

Pay is not on `staff`. Salary, allowances, commission rates and bonus live on
`staff_compensation` with their own policy, because RLS cannot restrict columns
and `staff_select` lets five roles read every staff row (`0249`, `0250`).
