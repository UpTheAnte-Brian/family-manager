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
- Today schedule highlights from existing planner/calendar seed data.
- Assigned weekly chores and responsibilities.
- Reminder placeholders for things to bring, wear, or remember.
- Browser-local completion state until Supabase persistence is introduced.

Face recognition is intentionally out of scope for v1. The app should be valuable without it.

## Core Data Concepts

The existing planner JSON remains the seed data source until the Supabase model is ready.

- `household.members`: family profiles and basic roles.
- `chores.routineChores`: recurring checklist items, currently morning routines.
- `chores.weeklyChores`: reusable chore bank.
- `chores.weeklyAssignmentTemplates`: recurring chore responsibilities by child and weekday.
- `fixedEvents`: imported calendar items.
- `dayTemplates`: baseline draft schedule blocks.

Future durable concepts:

- households
- household members
- routines and routine items
- tasks, chores, and completions
- calendar events and calendar sources
- profile preferences, needs, and private notes

## Architecture Direction

Use a local-first architecture with three operating modes.

1. Standalone iPad mode: local seed/config data plus browser persistence for the earliest MVP.
2. Home server mode: a Mac Mini runs local APIs, background jobs, calendar/weather refreshes, and LAN-first service.
3. Cloud sync mode: Supabase remote provides auth, backup, cross-device sync, and parent access away from home.

Supabase should store structured operating data. It should not be the required runtime for the morning dashboard once home-server mode exists.

Sensitive identity data should stay local. If face recognition is added later, recognition should produce a suggestion like “Looks like Kenzley. Continue?” rather than silently authenticating the user.

## Implementation Phases

### Phase 0: Docs and Repo Baseline

- Rewrite the README around the household console direction.
- Document local-first, Mac Mini, Supabase, and deferred face recognition decisions.
- Preserve the summer planner prototype as seed data.
- Keep local env files and secrets out of git.
- Create a private GitHub remote and push the cleaned baseline.

### Phase 1: Personal Dashboard MVP

- Replace the prototype overview with a profile-aware dashboard.
- Add manual profile switching.
- Filter routines, events, and assignments by selected profile.
- Persist checklist completions in localStorage.
- Keep the existing planner data and importer intact.

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
- Calendar and chore seed data still load from the existing JSON.
- README and planning docs explain the pivot and future architecture.
