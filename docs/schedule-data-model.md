# Schedule Data Model

`data/summer-2026-planner.json` is now prototype configuration data for the household console. The UI can change freely, but this file should remain easy to transform into dashboard state, calendar events, and future Supabase rows.

The dashboard must not treat this file as the source of truth for the current date. Today is computed from the real date in the household timezone. If today does not exist inside this prototype data, the app should show the real date with empty events and a missing-baseline state.

## Current Assumptions

- Summer starts on `2026-06-02`.
- Labor Day is `2026-09-07`.
- School resumes after Labor Day, currently modeled as `2026-09-08`.
- Kids are awake around `07:30` and bedtime is `20:00`.
- Weekday work-from-home protection matters most from `08:00-16:00`.
- Draft blocks inside quiet house hours should bias toward daily reading, workbook time, crafts, puzzles, independent projects, outside activity, lunch/reset, and rest.
- School-year weekday and weekend baselines are not modeled yet.
- Personal and sports calendar data is configured through `/admin` and stored browser-locally until Supabase persistence exists.

## Calendar Setup Path

1. Keep baseline schedule blocks as `draft` calendar items.
2. Use `/admin` to add Apple/shared family, SportsEngine, school, and other ICS or `webcal://` sources.
3. Preview each source and apply it to the local dashboard feed.
4. Run `pnpm plan:summer-workdays` during development to regenerate the summer weekday coverage plan.
5. Resolve conflicts by date and time, preferring applied fixed events over generated draft-like blocks.
6. Use the applied and generated events as today-dashboard context.
7. Promote calendar sources and applied events into Supabase so setup syncs across devices.

The old `pnpm import:calendar`, `pnpm import:sports`, and `pnpm refresh:family-calendar` scripts remain development utilities. Do not commit personal calendar exports or imported personal calendar events into seed data.

## Generated Summer Workday Plan

`pnpm plan:summer-workdays` regenerates fixed events from the `summer-workday-plan` source. The script removes prior generated events and rebuilds them from the current planner data, so it is safe to rerun after calendar imports.

The generated plan applies to Monday-Friday dates inside the summer season and assigns events to all child profiles:

- `08:00-09:00`: Quiet me time: reading or pickup.
- `09:00-11:00`: Away activity: biking, soccer, park, or outing.
- `11:30-12:00`: Lunch.
- `12:00-14:00`: At-home outside time.
- `15:30-16:00`: Toy pickup and house reset.

Substantive child activities such as VBS, camp, school, lessons, practices, games, appointments, doctor, dentist, soccer, tennis, gymnastics, and hockey should suppress overlapping generated blocks once they are applied from calendar feeds. Reminder-like events such as paying, ordering, calling, packing, registering, signing up, or bringing snacks should not suppress the plan by themselves.

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

The dashboard now also stores user-created same-day tasks, same-day reminders, locally added recurring routine steps, and locally added recurring responsibilities in `family-manager:dashboard:v1`.

## Durable Action Item Model

The Supabase migration in `supabase/migrations` promotes the dashboard's three editable surfaces into one durable action-item model.

- `routine`: recurring checklist step with `days_of_week`, `start_time`, and `end_time`.
- `task`: dated responsibility with `occurrence_date`, or recurring responsibility with `days_of_week`, `start_time`, and `end_time`.
- `reminder`: dated remember item with `occurrence_date`.
- `household_action_item_completions`: occurrence-level checkoff records for routines and tasks.

This keeps the v1 browser-local UI simple while giving the later Supabase sync layer a single durable contract to target.

Count-based habits should extend this contract rather than becoming a separate checklist system. Examples include push-ups, sit-ups, cups of water, pages read, or minutes practiced. The action item should define a numeric unit and optional daily target, while the occurrence record stores the value entered for that person and date.

This contract also works for a future client-side voice AI. The voice layer should turn speech into structured action-item requests and call the same authenticated API routes as the iPad UI, rather than writing directly to browser storage or bypassing household authorization.
