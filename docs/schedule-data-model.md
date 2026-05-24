# Schedule Data Model

`data/summer-2026-planner.json` is now prototype configuration data for the household console. The UI can change freely, but this file should remain easy to transform into dashboard state, calendar events, and future Supabase rows.

The dashboard must not treat this file as the source of truth for the current date. Today is computed from the real date in the household timezone. If today does not exist inside this prototype data, the app should show the real date with empty events and a missing-baseline state.

## Current Assumptions

- Summer starts on `2026-06-02`.
- Labor Day is `2026-09-07`.
- School resumes after Labor Day, currently modeled as `2026-09-08`.
- Kids are awake around `07:30` and bedtime is `20:00`.
- Weekday work-from-home protection matters most from `09:00-12:00` and `13:00-16:30`.
- School-year weekday and weekend baselines are not modeled yet.
- Calendar data is imported prototype data, not a live calendar connection.

## Import Path

1. Keep baseline schedule blocks as `draft` calendar items.
2. Export Apple Calendar data to `imports/family-calendar.ics`.
3. Run `pnpm import:calendar`.
4. Import the family calendar as `fixed` items.
5. Resolve conflicts by date and time, preferring fixed events over draft blocks.
6. Use the imported events as today-dashboard context.
7. Promote the stable parts of the JSON shape into Supabase tables once the dashboard behavior feels right.

For SportsEngine, use `SPORTSENGINE_CALENDAR_URL` in `.env.local` and run `pnpm import:sports`. That source is replaced on each refresh because subscription calendars change after the first import.

## Likely Supabase Tables

- `planner_seasons`
- `household_members`
- `day_templates`
- `schedule_blocks`
- `fixed_events`
- `calendar_sources`
- `chores`
- `chore_assignment_templates`
- `chore_completions`
- `allowance_entries`

The broader household console will also need durable records for households, routines, routine items, profile preferences, reminders, and device enrollment. Sensitive identity artifacts such as face images or recognition embeddings should stay local unless a later privacy review creates a specific reason to sync them.

## Chores

Chores now live under `chores` in `data/summer-2026-planner.json`.

- `routineChores` are daily checklists, currently the kids' weekday morning routine.
- `weeklyChores` are the reusable chore bank.
- `weeklyAssignmentTemplates` assigns weekly chore slots by child and weekday.
- `completions` is intentionally empty for now; each completion should eventually record who completed the task and when.

The current target is five weekly assigned chores per child. Morning routine chores do not count toward that weekly target.

The old chore manager stored chore edits and completions in browser `localStorage` under `family-manager:chores:v1`. The profile dashboard stores checklist completions under `family-manager:dashboard:v1`. Both are temporary persistence layers until these records move into Supabase.

The dashboard now also stores user-created same-day tasks and reminders in `family-manager:dashboard:v1`.
