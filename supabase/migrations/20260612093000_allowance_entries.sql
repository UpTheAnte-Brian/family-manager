create table public.allowance_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  household_member_id uuid not null,
  chore_completion_id uuid,
  chore_id uuid,
  entry_type text not null default 'chore_completion' check (entry_type in ('chore_completion', 'manual_adjustment')),
  amount_cents integer not null,
  occurred_at timestamptz not null default now(),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, household_member_id)
    references public.household_members(household_id, id)
    on delete cascade,
  foreign key (household_id, chore_completion_id)
    references public.chore_completions(household_id, id)
    on delete cascade,
  foreign key (household_id, chore_id)
    references public.chores(household_id, id)
    on delete set null,
  unique (household_id, chore_completion_id)
);

create index allowance_entries_member_occurred_at_idx
  on public.allowance_entries(household_id, household_member_id, occurred_at desc);

grant select, insert, update, delete on public.allowance_entries to authenticated;

alter table public.allowance_entries enable row level security;

create policy "Household users can read allowance entries"
  on public.allowance_entries
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household users can manage allowance entries"
  on public.allowance_entries
  for all
  to authenticated
  using (public.is_household_user(household_id))
  with check (public.is_household_user(household_id));

comment on table public.allowance_entries is
  'Household allowance ledger. Chore-based credits should point at the originating chore completion so undoing the completion removes the credit.';
