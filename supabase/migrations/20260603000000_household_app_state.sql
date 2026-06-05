create table public.household_app_state (
  household_id uuid not null references public.households(id) on delete cascade,
  storage_key text not null,
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, storage_key)
);

comment on table public.household_app_state is
  'Temporary durable sync store for browser-local Family Manager state while dedicated Supabase tables are introduced.';

alter table public.household_app_state enable row level security;

grant select, insert, update, delete on public.household_app_state to authenticated;

create policy "Household users can read app state"
  on public.household_app_state
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household users can insert app state"
  on public.household_app_state
  for insert
  to authenticated
  with check (public.is_household_user(household_id));

create policy "Household users can update app state"
  on public.household_app_state
  for update
  to authenticated
  using (public.is_household_user(household_id))
  with check (public.is_household_user(household_id));

insert into public.households (id, name, timezone)
values ('00000000-0000-0000-0000-000000000001', 'Family Manager Household', 'America/Chicago')
on conflict (id) do update
set
  name = excluded.name,
  timezone = excluded.timezone,
  updated_at = now();
