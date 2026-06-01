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
- Household members, summer schedule blocks, fixed calendar events, routine chores, weekly chores, and chore assignments in `data/summer-2026-planner.json`.
- A manual profile dashboard that filters routines, events, and chores by selected family member.
- Real-date Today Engine with explicit missing states when no baseline is configured for the current day.
- Browser-local checklist completion tracking plus editable routine steps, recurring responsibilities, and same-day task/reminder quick-add.
- Admin setup route for shared calendar source URLs, ICS preview, and local apply-to-dashboard.
- ICS importer for Apple Calendar and SportsEngine feeds.
- Supabase migration target for recurring routines, recurring responsibilities, dated tasks, dated reminders, and shared completion records.

## Data Status

The app is not connected to Supabase or a live calendar yet.

- Prototype configuration data lives in `data/summer-2026-planner.json`.
- Local user actions are stored in browser `localStorage`.
- Imported-looking calendar events are prototype data.
- Supabase is planned for durable sync, backup, auth, and remote access. The first durable action-item schema lives in `supabase/migrations`.

## Getting Started

Install dependencies and run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env.local` when Supabase is ready. Keep real local env files out of git.

## Planning Docs

- `docs/household-console-plan.md` describes the product and architecture plan.
- `docs/schedule-data-model.md` documents the existing planner JSON and how it should feed the new dashboard.

## Import Apple Calendar

In Apple Calendar, select the calendar in the sidebar, then use `File > Export > Export...` and save the `.ics` file to `imports/family-calendar.ics`.

Then run:

```bash
pnpm import:calendar
```

The importer expands recurring events inside the summer date range and writes them into `data/summer-2026-planner.json` as fixed events.

## Refresh SportsEngine Calendar

SportsEngine should be imported from its subscription URL because schedules can change.

Add this to `.env.local`:

```bash
SPORTSENGINE_CALENDAR_URL="https://..."
```

Then run:

```bash
pnpm import:sports
```

This replaces existing `sportsengine-calendar` events inside the summer date range with the latest subscription feed.

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
