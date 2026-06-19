create table public.household_activity_definitions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  title_key text generated always as (lower(regexp_replace(btrim(title), '\s+', ' ', 'g'))) stored,
  unit_label text not null default 'count' check (btrim(unit_label) <> ''),
  sponsor_amount_cents integer check (sponsor_amount_cents is null or sponsor_amount_cents >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, title_key)
);

create table public.household_activity_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  activity_definition_id uuid not null,
  household_member_id uuid not null,
  occurrence_date date not null,
  quantity integer not null check (quantity > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, activity_definition_id)
    references public.household_activity_definitions(household_id, id)
    on delete cascade,
  foreign key (household_id, household_member_id)
    references public.household_members(household_id, id)
    on delete cascade,
  unique (household_id, activity_definition_id, household_member_id, occurrence_date)
);

create index household_activity_definitions_household_status_idx
  on public.household_activity_definitions(household_id, status, title);

create index household_activity_entries_member_date_idx
  on public.household_activity_entries(household_id, household_member_id, occurrence_date desc);

create index household_activity_entries_activity_date_idx
  on public.household_activity_entries(household_id, activity_definition_id, occurrence_date desc);

grant select, insert, update, delete on public.household_activity_definitions to authenticated;
grant select, insert, update, delete on public.household_activity_entries to authenticated;

alter table public.household_activity_definitions enable row level security;
alter table public.household_activity_entries enable row level security;

create policy "Household users can read activity definitions"
  on public.household_activity_definitions
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household users can manage activity definitions"
  on public.household_activity_definitions
  for all
  to authenticated
  using (public.is_household_user(household_id))
  with check (public.is_household_user(household_id));

create policy "Household users can read activity entries"
  on public.household_activity_entries
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household users can manage activity entries"
  on public.household_activity_entries
  for all
  to authenticated
  using (public.is_household_user(household_id))
  with check (public.is_household_user(household_id));

comment on table public.household_activity_definitions is
  'Shared household activity tracker options such as push-ups, reading minutes, shots, or water. Sponsorship amounts are optional and configured per unit.';

comment on table public.household_activity_entries is
  'Per-member daily quantities for tracked activities.';
