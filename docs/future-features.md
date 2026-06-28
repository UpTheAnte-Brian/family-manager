# Future Features

This file tracks useful features that are intentionally deferred so they do not distract from the current build.

## Backlog

### Guided Household Onboarding And Interest-Based Seeding

- Goal: Let a new household answer a short setup questionnaire so the app can seed relevant defaults the way consumer apps ask what you are interested in before shaping the first experience.
- Why this matters:
  - The current app has useful seed data, but it is still baked into prototype config and not intentionally tailored per household.
  - New households should not have to start from a blank state or inherit every possible default.
  - Parents should understand that these choices are shaping suggested setup, not locking them into a rigid system.
- Desired behavior:
  - During setup, ask a short series of household questions such as child ages, pets, sports, allowance usage, preferred morning flow, school-year vs summer use, screen-time tracking, recurring maintenance needs, and whether the family wants chores pre-assigned or just suggested.
  - Group questions into a few clear sections so setup feels like guided configuration rather than a long form.
  - Show plain-language examples for each choice so parents know what the app will add if they opt in.
  - Let parents skip sections and start lean.
  - Show a preview before saving, such as routine steps, weekly chores, sample responsibilities, calendar source suggestions, and optional activity/habit trackers.
  - Save the household's onboarding answers as durable preferences so the setup can be revisited later.
  - Seed chosen defaults into household-scoped Supabase records instead of relying on baked JSON as the effective source of truth.
  - Mark seeded records with template metadata so the app can tell the difference between generated defaults and later user-authored edits.
  - Make the seeding flow idempotent so reopening setup does not create duplicate chores, templates, or routines.
  - Allow parents to accept a whole bundle, accept only selected items, or remove seeded items later.
- Implementation notes:
  - Treat onboarding as template selection plus import, not as a one-time wizard that directly mutates unrelated tables without traceability.
  - Keep a library of reusable baseline templates such as `young-kids-morning-routine`, `pets-daily-care`, `starter-weekly-chores`, `allowance-enabled`, `sports-family-calendar`, and `seasonal-home-maintenance`.
  - Store household onboarding answers separately from the generated items so the app can recommend changes later without losing the audit trail of what was originally chosen.
  - Each seeded record should carry enough metadata to support "added from template", "customized after import", and "safe to refresh" states.
  - Calendar and reminder suggestions should be opt-in and previewed before import.
  - Sensitive future categories such as health, behavior, or recognition settings should remain out of this flow unless a later privacy review explicitly adds them.
- Data-model direction:
  - Add a household onboarding/preferences store for durable answers and completed setup steps.
  - Add template identifiers and import metadata to chores, action items, assignments, and related seeded records.
  - Prefer upsert-style imports keyed by `household_id + template_key + template_item_key` where possible.
  - Keep template catalog data separate from household records so the catalog can evolve without rewriting each household manually.

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

### Seasonal Home Maintenance Track

- Goal: Find a more creative and visible way to incorporate basic home maintenance into the household system without making it feel like a generic chore list.
- Examples:
  - Replace furnace filters.
  - Check water softener salt, filters, or other recurring water-system needs.
  - Surface seasonal checks such as smoke-detector batteries, HVAC service, or water-heater upkeep.
- Desired behavior:
  - The app can group these as home-maintenance prompts, seasonal checklists, or milestone-based reminders instead of ordinary daily chores.
  - Parents can decide whether an item is a reminder, a dated task, or a recurring seasonal responsibility.
  - The dashboard should make infrequent maintenance feel timely and intentional rather than overdue for months at a time.

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
