# Family Manager

Family Manager is an iPad-first household console. The goal is a shared kitchen or mudroom app that helps each family member answer three questions quickly:

- What do I need to do now?
- What is different about today?
- What does the house need from me?

The current app keeps the summer 2026 planner, chores, and calendar importer as prototype planning data while the product pivots toward a personalized daily dashboard.

## Current Direction

- Shared iPad experience first, with desktop support for development.
- Manual profile switching in v1 so the product is useful before identity automation.
- Local-first operation so the home dashboard remains fast and resilient.
- Optional Mac Mini home server for background jobs, local APIs, LAN access, and richer automation.
- Supabase remote for sync, backup, auth, and remote parent access, not as the only runtime.
- Face recognition deferred until the manual dashboard is valuable; when added, it should suggest a profile rather than act as sole authentication.

## Current Prototype

- Next.js app shell with TypeScript and Tailwind.
- Household members, summer schedule blocks, generated summer workday events, routine chores, weekly chores, and chore assignments in `data/summer-2026-planner.json`.
- A manual profile dashboard that filters routines, events, and chores by selected family member.
- Real-date Today Engine with explicit missing states when no baseline is configured for the current day.
- Browser-local checklist completion tracking plus editable routine steps, recurring responsibilities, and same-day task/reminder quick-add.
- Admin setup route for shared calendar source URLs, ICS preview, and local apply-to-dashboard.
- Browser-local ICS setup for Apple Calendar, SportsEngine, school, and other shared calendar feeds.
- Supabase migration target for recurring routines, recurring responsibilities, dated tasks, dated reminders, and shared completion records.

## Data Status

The app has the Supabase household schema in place, but the main dashboard still renders from browser-local state until the UI is moved onto normalized tables.

- Prototype configuration data lives in `data/summer-2026-planner.json`.
- User actions, saved calendar sources, applied calendar events, chore edits, and assignment overrides currently render from browser `localStorage`.
- Personal calendar data should be added through `/admin` on the deployed app, not committed into seed data.
- Supabase access is scoped by `household_users`, so each account only sees households it belongs to.

## Getting Started

Install dependencies and run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env.local` when Supabase is ready. Keep real local env files out of git.

## Supabase Sync

Apply the Supabase migrations, then configure these values locally and in Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
```

Supabase data access requires an authenticated Supabase session and a matching `household_users` row. Without that session, the app keeps working from browser `localStorage`.

After deployment, open `/setup` to create or sign in to an owner account and create a household. The same account can belong to multiple households. `/setup` now lets household owners and parents invite additional adult accounts and switch the active household when one account belongs to more than one family context.

The normalized Supabase schema includes durable tables for:

- households and household users
- household members
- calendar sources and calendar events
- action items, assignments, and completions
- chores, chore assignment templates, and chore completions

The next step is moving the UI surfaces from browser-local storage onto those tables.

## Planning Docs

- `docs/household-console-plan.md` describes the product and architecture plan.
- `docs/schedule-data-model.md` documents the existing planner JSON and how it should feed the new dashboard.

## Add Calendar Sources

Open `/admin` in the app to add shared calendar feeds.

Use this flow for Apple/shared family calendars, SportsEngine, school calendars, and other public ICS or `webcal://` URLs:

1. Add a source label and shared URL.
2. Choose the source type.
3. Select default household members when the whole source usually belongs to one person.
4. Preview the feed.
5. Apply the preview to the local dashboard feed.

Calendar source setup syncs through Supabase when the Supabase env vars are configured. Without Supabase, it remains browser-local.

## Local Calendar Import Script

`scripts/import-ics-to-planner.mjs` remains available as a development utility, but personal calendars should not be committed into `data/summer-2026-planner.json`.

For generated baseline planning, run:

```bash
pnpm plan:summer-workdays
```

## GitHub Remote Setup

The intended first remote should be a private GitHub repository.

```bash
git status --short
git remote add origin git@github.com:<account>/family-manager.git
git add .
git status --short
git commit -m "Pivot family manager to household console"
git push -u origin main
```

Before staging, confirm no real env files, private calendar exports, or other local-only files are included.
