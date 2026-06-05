create extension if not exists pgcrypto;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Chicago',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_users (
  household_id uuid not null references public.households(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'parent', 'caregiver', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, auth_user_id)
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  external_key text not null,
  preferred_name text not null,
  display_name text,
  role text not null check (role in ('parent', 'child')),
  relationship text,
  birth_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, external_key),
  unique (household_id, id)
);

create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  external_key text not null,
  label text not null,
  source_kind text not null check (
    source_kind in ('ics-url', 'apple-calendar', 'sportsengine', 'school-calendar', 'manual-upload')
  ),
  url text,
  enabled boolean not null default true,
  sync_mode text not null default 'manual' check (sync_mode in ('manual', 'scheduled')),
  default_visibility text not null default 'family' check (
    default_visibility in ('family', 'parents', 'assigned-members')
  ),
  notes text,
  last_synced_at timestamptz,
  last_applied_at timestamptz,
  last_sync_status text check (last_sync_status in ('success', 'error', 'never')),
  last_sync_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, external_key),
  unique (household_id, id)
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  calendar_source_id uuid references public.calendar_sources(id) on delete set null,
  source_event_uid text,
  title text not null,
  description text,
  category text not null default 'calendar',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  status text not null default 'active' check (status in ('active', 'cancelled', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at),
  unique (household_id, calendar_source_id, source_event_uid, starts_at),
  unique (household_id, id)
);

create table public.household_action_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
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
  unique (household_id, id),
  check (
    (
      item_kind in ('routine', 'task')
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

create table public.household_assignments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  assignable_type text not null check (
    assignable_type in ('calendar_event', 'action_item', 'chore', 'chore_assignment_template')
  ),
  assignable_id uuid not null,
  assignee_type text not null check (assignee_type in ('household', 'member')),
  household_member_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (assignee_type = 'household' and household_member_id is null)
    or
    (assignee_type = 'member' and household_member_id is not null)
  ),
  foreign key (household_id, household_member_id)
    references public.household_members(household_id, id)
    on delete cascade,
  unique (household_id, assignable_type, assignable_id, assignee_type, household_member_id)
);

create table public.household_action_item_completions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  action_item_id uuid not null,
  occurrence_date date not null,
  completed_by_member_id uuid,
  completed_at timestamptz not null default now(),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, action_item_id)
    references public.household_action_items(household_id, id)
    on delete cascade,
  foreign key (household_id, completed_by_member_id)
    references public.household_members(household_id, id)
    on delete set null,
  unique (household_id, action_item_id, occurrence_date)
);

create table public.chores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  external_key text,
  title text not null,
  description text,
  chore_kind text not null default 'weekly' check (chore_kind in ('routine', 'weekly', 'ad_hoc')),
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, external_key),
  unique (household_id, id)
);

create table public.chore_assignment_templates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  chore_id uuid not null,
  day_of_week text not null check (day_of_week in ('SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA')),
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, chore_id)
    references public.chores(household_id, id)
    on delete cascade,
  unique (household_id, id)
);

create table public.chore_completions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  chore_id uuid not null,
  assignment_template_id uuid,
  occurrence_date date not null,
  completed_by_member_id uuid,
  completed_at timestamptz not null default now(),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, chore_id)
    references public.chores(household_id, id)
    on delete cascade,
  foreign key (household_id, assignment_template_id)
    references public.chore_assignment_templates(household_id, id)
    on delete set null,
  foreign key (household_id, completed_by_member_id)
    references public.household_members(household_id, id)
    on delete set null,
  unique (household_id, chore_id, assignment_template_id, occurrence_date)
);

create index household_users_auth_user_id_idx
  on public.household_users(auth_user_id);

create index household_members_household_id_idx
  on public.household_members(household_id);

create index calendar_sources_household_id_idx
  on public.calendar_sources(household_id);

create index calendar_events_household_starts_at_idx
  on public.calendar_events(household_id, starts_at)
  where status = 'active';

create index household_action_items_today_idx
  on public.household_action_items(household_id, item_kind, occurrence_date)
  where status = 'active';

create index household_action_items_routine_idx
  on public.household_action_items(household_id, item_kind)
  where status = 'active' and item_kind in ('routine', 'task');

create index household_assignments_lookup_idx
  on public.household_assignments(household_id, assignable_type, assignable_id);

create index household_assignments_member_idx
  on public.household_assignments(household_id, household_member_id)
  where assignee_type = 'member';

create index household_action_item_completions_lookup_idx
  on public.household_action_item_completions(household_id, action_item_id, occurrence_date);

create index chore_assignment_templates_lookup_idx
  on public.chore_assignment_templates(household_id, chore_id, day_of_week)
  where status = 'active';

create index chore_completions_lookup_idx
  on public.chore_completions(household_id, occurrence_date);

create or replace function public.is_household_user(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_users
    where household_id = target_household_id
      and auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_household_admin(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_users
    where household_id = target_household_id
      and auth_user_id = auth.uid()
      and role in ('owner', 'parent')
  );
$$;

grant execute on function public.is_household_user(uuid) to authenticated;
grant execute on function public.is_household_admin(uuid) to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.households to authenticated;
grant select, insert, update, delete on public.household_users to authenticated;
grant select, insert, update, delete on public.household_members to authenticated;
grant select, insert, update, delete on public.calendar_sources to authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;
grant select, insert, update, delete on public.household_action_items to authenticated;
grant select, insert, update, delete on public.household_assignments to authenticated;
grant select, insert, update, delete on public.household_action_item_completions to authenticated;
grant select, insert, update, delete on public.chores to authenticated;
grant select, insert, update, delete on public.chore_assignment_templates to authenticated;
grant select, insert, update, delete on public.chore_completions to authenticated;

alter table public.households enable row level security;
alter table public.household_users enable row level security;
alter table public.household_members enable row level security;
alter table public.calendar_sources enable row level security;
alter table public.calendar_events enable row level security;
alter table public.household_action_items enable row level security;
alter table public.household_assignments enable row level security;
alter table public.household_action_item_completions enable row level security;
alter table public.chores enable row level security;
alter table public.chore_assignment_templates enable row level security;
alter table public.chore_completions enable row level security;

create policy "Household members can read households"
  on public.households
  for select
  to authenticated
  using (public.is_household_user(id));

create policy "Household admins can update households"
  on public.households
  for update
  to authenticated
  using (public.is_household_admin(id))
  with check (public.is_household_admin(id));

create policy "Household users can read memberships"
  on public.household_users
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household admins can manage memberships"
  on public.household_users
  for all
  to authenticated
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));

create policy "Household users can read household members"
  on public.household_members
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household admins can manage household members"
  on public.household_members
  for all
  to authenticated
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));

create policy "Household users can read calendar sources"
  on public.calendar_sources
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household admins can manage calendar sources"
  on public.calendar_sources
  for all
  to authenticated
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));

create policy "Household users can read calendar events"
  on public.calendar_events
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household admins can manage calendar events"
  on public.calendar_events
  for all
  to authenticated
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));

create policy "Household users can read action items"
  on public.household_action_items
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household users can manage action items"
  on public.household_action_items
  for all
  to authenticated
  using (public.is_household_user(household_id))
  with check (public.is_household_user(household_id));

create policy "Household users can read assignments"
  on public.household_assignments
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household users can manage assignments"
  on public.household_assignments
  for all
  to authenticated
  using (public.is_household_user(household_id))
  with check (public.is_household_user(household_id));

create policy "Household users can read action completions"
  on public.household_action_item_completions
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household users can manage action completions"
  on public.household_action_item_completions
  for all
  to authenticated
  using (public.is_household_user(household_id))
  with check (public.is_household_user(household_id));

create policy "Household users can read chores"
  on public.chores
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household users can manage chores"
  on public.chores
  for all
  to authenticated
  using (public.is_household_user(household_id))
  with check (public.is_household_user(household_id));

create policy "Household users can read chore assignment templates"
  on public.chore_assignment_templates
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household users can manage chore assignment templates"
  on public.chore_assignment_templates
  for all
  to authenticated
  using (public.is_household_user(household_id))
  with check (public.is_household_user(household_id));

create policy "Household users can read chore completions"
  on public.chore_completions
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household users can manage chore completions"
  on public.chore_completions
  for all
  to authenticated
  using (public.is_household_user(household_id))
  with check (public.is_household_user(household_id));

comment on table public.household_users is
  'Join table between Supabase auth users and households. This is the primary tenant boundary for RLS.';

comment on table public.household_assignments is
  'Generic assignment table for assigning events, action items, chores, and chore templates to either the whole household or a specific household member.';

comment on table public.household_action_items is
  'Durable source for recurring routines, recurring responsibilities, dated task records, and dated reminders. Recurring routines/tasks use days_of_week/start_time/end_time; dated tasks/reminders use occurrence_date.';

comment on table public.household_action_item_completions is
  'Occurrence-level completion records for routines and tasks/responsibilities.';
