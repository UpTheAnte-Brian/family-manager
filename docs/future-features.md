# Future Features

This file tracks useful features that are intentionally deferred so they do not distract from the current build.

## Backlog

### Shared Grocery List

- Goal: Give the whole family one shared grocery list that anyone can add to.
- Desired behavior:
  - Family members can quickly add grocery items from the dashboard.
  - Items can be checked off when purchased without being tied to a calendar day.
  - The list stays shared across devices so parent phones and the household display show the same needs.

### General Household To-Do List

- Goal: Track household tasks that need to get done but are not tied to a specific day on the calendar.
- Desired behavior:
  - Family members can add, assign, complete, and optionally prioritize tasks.
  - Tasks can exist independently from daily routines, chores, reminders, and calendar events.
  - The dashboard can surface open tasks without making them look overdue simply because a day changed.

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

- Goal: Keep non-SportsEngine family events in sync without each browser/device relying on local calendar source setup.
- Current workaround: Add a shared Family calendar ICS or `webcal://` source through `/admin`, preview it, and apply it to the local dashboard feed.
- Desired behavior: Use a refreshable calendar feed or local Mac-based sync process so changes from the shared iCloud Family calendar can be pulled into the family manager app automatically.
- Notes:
  - A one-time `.ics` export is only a snapshot and does not receive push updates.
  - A public `webcal://` or `https://...ics` subscription URL would support periodic refreshes, but not true push.
  - Supabase should store calendar sources and applied events so setup follows the family across devices.
  - Once a Mac mini is available, evaluate whether it can run a scheduled sync job against Apple Calendar/iCloud data and update Supabase.
