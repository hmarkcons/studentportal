# Database setup

1. Open the Supabase dashboard → **SQL Editor** → New query.
2. Paste the contents of `migrations/0001_init.sql` and run it. This creates all tables, RLS policies, and seeds the document checklist drafts.
3. Invite staff accounts: **Authentication → Users → Add user** (or Invite by email) for each counselor/admin.
4. For each invited user, add their row to `staff` so the app knows their name and role — in the SQL Editor:

```sql
insert into staff (id, full_name, role)
values ('<the user''s UUID from Authentication > Users>', 'Ayesha Khan', 'counselor');
```

Without a `staff` row, a logged-in user can sign in but won't see any students (RLS has nothing to match against).
