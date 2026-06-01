# Household Console Plan

## Product Principles

Family Manager should feel like a household appliance, not another private productivity app. The first screen should be useful to a child or parent standing at a shared iPad for less than a minute.

- Make the current person obvious and easy to change.
- Show the smallest useful version of the day: routines, schedule changes, responsibilities, and reminders.
- Keep child flows glanceable and tappable.
- Confirm consequential actions instead of trusting recognition or accidental taps.
- Keep sensitive identity and health information local unless there is a clear reason to sync it.

## V1: Manual Profile Dashboard

The first implementation milestone is manual profile switching. A family member opens the iPad, taps their profile, and sees a personalized today view.

The dashboard should include:

- Morning routine checklist for children.
- Adult-oriented household operations for parents.
- Today schedule highlights from existing planner/calendar prototype data.
- Assigned weekly chores and responsibilities.
- Reminder placeholders for things to bring, wear, or remember.
- Browser-local completion state until Supabase persistence is introduced.

Face recognition is intentionally out of scope for v1. The app should be valuable without it.

## Today Engine

The dashboard should always represent the real current date in the household timezone. It must not fall back to the first summer planner day just because no configured data exists for today.

The Today Engine owns:

- current local date and day of week
- day classification: school day, school-year weekend, summer weekday, summer weekend, no-school day, holiday
- fixed events that match the current date
- baseline flow selection
- explicit missing-baseline states when a day type has not been modeled yet

This means May dates before the summer plan range should show as May dates. If there is no configured school-year or weekend baseline yet, the UI should say that plainly.

## Core Data Concepts

The existing planner JSON remains the prototype configuration source until the Supabase model is ready.

- `household.members`: family profiles and basic roles.
- `chores.routineChores`: recurring checklist items, currently morning routines.
- `chores.weeklyChores`: reusable chore bank.
- `chores.weeklyAssignmentTemplates`: recurring chore responsibilities by child and weekday.
- `fixedEvents`: imported calendar items.
- `dayTemplates`: baseline draft schedule blocks.

Browser-local state currently stores:

- selected profile
- routine checkoffs
- locally added recurring routine steps
- chore completions
- locally added recurring responsibilities
- user-created same-day tasks
- user-created same-day reminders
- admin calendar source settings

Future durable concepts:

- households
- household members
- routines and routine items
- tasks, chores, and completions
- calendar events and calendar sources
- profile preferences, needs, and private notes

The first Supabase action-item model intentionally gives routines, tasks, and reminders a shared durable shape:

- recurring routines are `household_action_items.item_kind = 'routine'` with `days_of_week`, `start_time`, and `end_time`
- recurring responsibilities are `item_kind = 'task'` with `days_of_week`, `start_time`, and `end_time`
- dated tasks are also `item_kind = 'task'` with `occurrence_date`
- dated reminders are `item_kind = 'reminder'` with `occurrence_date`
- completion records point to an action item plus an occurrence date, so routine checkoffs and task completions use the same mechanism

Client-side voice AI should fit this architecture as another authenticated client of the same action-item APIs. Voice commands should produce structured mutations such as “create task”, “create recurring responsibility”, “complete routine occurrence”, or “add reminder”. The server should still validate household membership, allowed assignees, dates, recurrence, and audit metadata before writing to Supabase.

## Architecture Direction

Use a local-first architecture with three operating modes.

1. Standalone iPad mode: local configuration data plus browser persistence for the earliest MVP.
2. Home server mode: a Mac Mini runs local APIs, background jobs, calendar/weather refreshes, and LAN-first service.
3. Cloud sync mode: Supabase remote provides auth, backup, cross-device sync, and parent access away from home.

Supabase should store structured operating data. It should not be the required runtime for the morning dashboard once home-server mode exists.

Sensitive identity data should stay local. If face recognition is added later, recognition should produce a suggestion like “Looks like Kenzley. Continue?” rather than silently authenticating the user.

## Implementation Phases

### Phase 0: Docs and Repo Baseline

- Rewrite the README around the household console direction.
- Document local-first, Mac Mini, Supabase, and deferred face recognition decisions.
- Preserve the summer planner prototype as configuration data.
- Keep local env files and secrets out of git.
- Create a private GitHub remote and push the cleaned baseline.

### Phase 1: Personal Dashboard MVP

- Replace the prototype overview with a profile-aware dashboard.
- Add manual profile switching.
- Filter routines, events, and assignments by selected profile.
- Persist checklist completions and same-day quick-add tasks/reminders in localStorage.
- Let parents add household-specific recurring routine steps from the dashboard.
- Let parents add household-specific recurring responsibilities from the dashboard.
- Keep the existing planner data and importer intact.

### Phase 1.5: Day Modeling

- Add school-year weekday and weekend baselines.
- Add explicit no-school and holiday handling.
- Add manual day override controls for unusual days.
- Keep the classifier deterministic before adding AI-generated recommendations.

### Phase 1.6: Admin Calendar Sources

- Add an `/admin` setup route for parent configuration.
- Let parents save shared ICS/webcal URLs for Apple Calendar, SportsEngine, school, and other event lists.
- Preview imported events before they affect the dashboard.
- Apply reviewed preview events into a local dashboard feed.
- Keep saved sources local until Supabase persistence exists.
- Use source defaults and later rules to map events to people, gear, pickup, meal impact, and day type changes.

### Phase 2: Supabase Data Model

- Promote durable household records to Supabase.
- Keep local fallback behavior documented.
- Sync structured data, not local face images.
- Use Supabase for backup, remote access, and multi-device state.

### Phase 3: Home Server Mode

- Add a Mac Mini runtime for local API access and background jobs.
- Prefer LAN service when the iPad is at home.
- Sync to Supabase when online.
- Keep core dashboard use available during internet outages.

### Phase 4: Identity Recognition Spike

- Prototype local-only face recognition only after the manual dashboard is useful.
- Store recognition profiles locally on trusted hardware unless a later privacy review changes that.
- Require obvious confirmation when the app is uncertain or when the action matters.

## Acceptance Criteria

- A family member can select their profile manually.
- The dashboard changes based on the selected profile.
- Child profiles show morning routine, assigned chores, and today context.
- Parent profiles show household operations and today context.
- Checklist state persists across refresh.
- Calendar and chore prototype data still load from the existing JSON.
- README and planning docs explain the pivot and future architecture.
