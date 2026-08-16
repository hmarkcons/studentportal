# Case Flow

Internal student-case management portal for HMark Consultants — tracks students through the study-abroad journey from inquiry to enrollment, with a document checklist tracker for counselors and admin.

Phase 1 scope, design rationale, and build plan: see the published design artifacts (Case Flow Canvas, Case Flow Blueprint) shared in project discussion.

## Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS
- Supabase (Postgres, Auth, Storage)
- Vercel (hosting)

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` — see `.env.example`.
