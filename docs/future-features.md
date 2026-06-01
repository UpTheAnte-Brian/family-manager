# Future Features

This file tracks useful features that are intentionally deferred so they do not distract from the current build.

## Backlog

### Count-Based Daily Habits

- Goal: Track daily quantities for good behaviors instead of only checkoffs.
- Examples:
  - Brian enters push-ups or sit-ups completed.
  - Angela enters cups of water.
  - Kids could later enter pages read, minutes practiced, or other countable routines.
- Desired behavior:
  - Each habit has an owner, unit, optional target, and date.
  - The dashboard shows a number input or stepper instead of a checkbox.
  - Daily and weekly views can show progress against the target.
- Data-model note: extend action-item completions with a numeric value and unit instead of creating a separate habit store.

### Intentional Screen-Time Management

- Goal: Manage TV and screen time deliberately without making screen time part of the default calendar plan.
- Current assumption: If kids are awake before `08:00`, they may watch TV, but this should not appear as a scheduled daily event.
- Desired behavior:
  - Track daily or weekly screen-time limits by child.
  - Let parents approve exceptions for weather, illness, travel, or special events.
  - Keep screen time visible as a household decision rather than a default expectation.

## Deferred Until Mac Mini

### Shared iCloud Family Calendar Sync

- Goal: Keep non-SportsEngine family events in sync without manually exporting `family-calendar.ics`.
- Current workaround: Export the Family calendar from Apple Calendar to `imports/family-calendar.ics`, then run `pnpm import:calendar`.
- Desired behavior: Use a refreshable calendar feed or local Mac-based sync process so changes from the shared iCloud Family calendar can be pulled into the family manager app automatically.
- Notes:
  - A one-time `.ics` export is only a snapshot and does not receive push updates.
  - A public `webcal://` or `https://...ics` subscription URL would support periodic refreshes, but not true push.
  - Once a Mac mini is available, evaluate whether it can run a scheduled sync job against Apple Calendar/iCloud data and update the app's calendar source data.
