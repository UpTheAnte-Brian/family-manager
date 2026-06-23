alter table public.household_action_items
  drop constraint if exists household_action_items_check;

alter table public.household_action_items
  add constraint household_action_items_check
  check (
    (
      item_kind = 'routine'
      and occurrence_date is null
      and array_length(days_of_week, 1) is not null
      and (
        (
          start_time is not null
          and end_time is not null
        )
        or (
          jsonb_typeof(metadata->'durationMinutes') = 'number'
          and (metadata->>'durationMinutes')::integer > 0
          and jsonb_typeof(metadata->'offsetMinutes') = 'number'
          and (metadata->>'offsetMinutes')::integer >= 0
        )
      )
    )
    or (
      item_kind = 'task'
      and (
        (
          occurrence_date is null
          and array_length(days_of_week, 1) is not null
          and start_time is not null
          and end_time is not null
        )
        or (
          occurrence_date is not null
          and days_of_week = '{}'
        )
      )
    )
    or (
      item_kind = 'reminder'
      and occurrence_date is not null
      and days_of_week = '{}'
    )
  );

comment on table public.household_action_items is
  'Durable source for recurring routines, recurring responsibilities, dated task records, and dated reminders. Recurring routines can use either start/end times or duration/offset metadata tied to member wake-up defaults; recurring tasks use days_of_week/start_time/end_time; dated tasks/reminders use occurrence_date.';
