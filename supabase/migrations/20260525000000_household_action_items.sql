create extension if not exists pgcrypto;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Chicago',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  external_key text not null,
  preferred_name text not null,
  role text not null check (role in ('parent', 'child')),
  relationship text,
  birth_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, external_key)
);

create table public.household_action_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  assignee_member_id uuid not null references public.household_members(id) on delete cascade,
  item_kind text not null check (item_kind in ('routine', 'task', 'reminder')),
  title text not null,
  notes text,
  status text not null default 'active' check (status in ('active', 'archived')),
  source text not null default 'manual' check (source in ('manual', 'prototype', 'calendar', 'system')),
  occurrence_date date,
  days_of_week text[] not null default '{}',
  start_time time,
  end_time time,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (
      item_kind = 'routine'
      and occurrence_date is null
      and array_length(days_of_week, 1) is not null
      and start_time is not null
      and end_time is not null
    )
    or (
      item_kind = 'task'
      and occurrence_date is null
      and array_length(days_of_week, 1) is not null
      and start_time is not null
      and end_time is not null
    )
    or (
      item_kind in ('task', 'reminder')
      and occurrence_date is not null
      and days_of_week = '{}'
    )
  )
);

create table public.household_action_item_completions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  action_item_id uuid not null references public.household_action_items(id) on delete cascade,
  occurrence_date date not null,
  completed_by_member_id uuid references public.household_members(id) on delete set null,
  completed_at timestamptz not null default now(),
  notes text,
  unique (action_item_id, occurrence_date)
);

create index household_members_household_id_idx
  on public.household_members(household_id);

create index household_action_items_today_idx
  on public.household_action_items(household_id, assignee_member_id, item_kind, occurrence_date)
  where status = 'active';

create index household_action_items_routine_idx
  on public.household_action_items(household_id, assignee_member_id, item_kind)
  where status = 'active' and item_kind in ('routine', 'task');

create index household_action_item_completions_lookup_idx
  on public.household_action_item_completions(household_id, action_item_id, occurrence_date);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_action_items enable row level security;
alter table public.household_action_item_completions enable row level security;

comment on table public.household_action_items is
  'Durable source for recurring routines, recurring responsibilities, dated task records, and dated reminders. Recurring routines/tasks use days_of_week/start_time/end_time; dated tasks/reminders use occurrence_date.';

comment on table public.household_action_item_completions is
  'Occurrence-level completion records for routines and tasks/responsibilities. Reminders normally do not require completions, but can use the same model if needed.';
