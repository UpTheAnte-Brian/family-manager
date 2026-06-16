alter table public.allowance_entries
  drop constraint if exists allowance_entries_entry_type_check;

alter table public.allowance_entries
  add constraint allowance_entries_entry_type_check
  check (entry_type in ('chore_completion', 'manual_adjustment', 'morning_routine_completion'));

create unique index if not exists allowance_entries_morning_routine_once_per_day_idx
  on public.allowance_entries (
    household_id,
    household_member_id,
    ((metadata->>'routineCategory')),
    ((metadata->>'routineCompletionDate'))
  )
  where entry_type = 'morning_routine_completion';

comment on index public.allowance_entries_morning_routine_once_per_day_idx is
  'Prevents duplicate morning routine credits for the same member, category, and day.';
