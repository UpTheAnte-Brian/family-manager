create table public.allowance_request_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  household_member_id uuid not null references public.household_members(id) on delete cascade,
  requested_by_member_id uuid references public.household_members(id) on delete set null,
  approved_by_member_id uuid references public.household_members(id) on delete set null,
  chore_id uuid references public.chores(id) on delete set null,
  allowance_entry_id uuid references public.allowance_entries(id) on delete set null,
  chore_title text not null,
  category_id text references public.chore_categories(id) on delete set null,
  requested_amount_cents integer not null check (requested_amount_cents > 0),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  occurrence_date date not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);

create index allowance_request_entries_household_member_status_idx
  on public.allowance_request_entries(household_id, household_member_id, status, occurrence_date desc);

create index allowance_request_entries_household_status_idx
  on public.allowance_request_entries(household_id, status, requested_at desc);

grant select, insert, update, delete on public.allowance_request_entries to authenticated;

alter table public.allowance_request_entries enable row level security;

create policy "Household users can read allowance request entries"
  on public.allowance_request_entries
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household users can create allowance request entries"
  on public.allowance_request_entries
  for insert
  to authenticated
  with check (public.is_household_user(household_id));

create policy "Household admins can update allowance request entries"
  on public.allowance_request_entries
  for update
  to authenticated
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));

create policy "Household admins can delete allowance request entries"
  on public.allowance_request_entries
  for delete
  to authenticated
  using (public.is_household_admin(household_id));

comment on table public.allowance_request_entries is
  'Pending child bank credits that require household admin approval before an allowance ledger entry is created.';

create or replace function public.approve_allowance_request_entry(target_request_id uuid)
returns table (
  request_id uuid,
  allowance_entry_id uuid,
  chore_id uuid,
  chore_title text,
  household_member_id uuid,
  amount_cents integer,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.allowance_request_entries%rowtype;
  target_member public.household_members%rowtype;
  existing_chore public.chores%rowtype;
  resolved_chore_id uuid;
  resolved_allowance_entry_id uuid;
  approving_member_id uuid;
  occurred_timestamp timestamptz;
begin
  select *
  into request_row
  from public.allowance_request_entries
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Allowance request not found.';
  end if;

  if not public.is_household_admin(request_row.household_id) then
    raise exception 'Only household admins can approve allowance requests.';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Allowance request is no longer pending.';
  end if;

  select *
  into target_member
  from public.household_members
  where household_id = request_row.household_id
    and id = request_row.household_member_id;

  if not found or target_member.role <> 'child' then
    raise exception 'Allowance requests must target a child profile.';
  end if;

  select household_member.id
  into approving_member_id
  from public.household_users household_user
  join public.household_members household_member
    on household_member.household_id = household_user.household_id
   and household_member.role = 'parent'
  where household_user.household_id = request_row.household_id
    and household_user.auth_user_id = auth.uid()
  order by household_member.created_at asc
  limit 1;

  resolved_chore_id := request_row.chore_id;

  if resolved_chore_id is null then
    select *
    into existing_chore
    from public.chores
    where household_id = request_row.household_id
      and chore_kind = 'weekly'
      and status = 'active'
      and lower(trim(title)) = lower(trim(request_row.chore_title))
    order by created_at asc
    limit 1;

    if found then
      resolved_chore_id := existing_chore.id;
    else
      insert into public.chores (
        household_id,
        title,
        chore_kind,
        status,
        category_id,
        metadata
      )
      values (
        request_row.household_id,
        request_row.chore_title,
        'weekly',
        'active',
        coalesce(request_row.category_id, 'house-reset'),
        jsonb_strip_nulls(
          jsonb_build_object(
            'estimatedMinutes',
            coalesce(request_row.estimated_minutes, 20),
            'eligibleAssigneeIds',
            jsonb_build_array(target_member.external_key),
            'requiresAdultCheck',
            true,
            'allowanceAmount',
            round((request_row.requested_amount_cents::numeric / 100.0)::numeric, 2)
          )
        )
      )
      returning id into resolved_chore_id;
    end if;
  end if;

  occurred_timestamp := request_row.requested_at;

  insert into public.allowance_entries (
    household_id,
    household_member_id,
    chore_id,
    entry_type,
    amount_cents,
    occurred_at,
    metadata
  )
  values (
    request_row.household_id,
    request_row.household_member_id,
    resolved_chore_id,
    'manual_adjustment',
    request_row.requested_amount_cents,
    occurred_timestamp,
    jsonb_strip_nulls(
      jsonb_build_object(
        'allowanceRequestId',
        request_row.id,
        'choreTitle',
        request_row.chore_title,
        'label',
        request_row.chore_title,
        'note',
        request_row.note
      )
    )
  )
  returning id into resolved_allowance_entry_id;

  update public.allowance_request_entries
  set status = 'approved',
      approved_at = now(),
      approved_by_member_id = approving_member_id,
      chore_id = resolved_chore_id,
      allowance_entry_id = resolved_allowance_entry_id,
      updated_at = now()
  where id = request_row.id;

  return query
  select
    request_row.id,
    resolved_allowance_entry_id,
    resolved_chore_id,
    request_row.chore_title,
    request_row.household_member_id,
    request_row.requested_amount_cents,
    occurred_timestamp;
end;
$$;

grant execute on function public.approve_allowance_request_entry(uuid) to authenticated;
