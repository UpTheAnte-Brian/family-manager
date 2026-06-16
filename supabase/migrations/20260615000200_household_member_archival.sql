alter table public.household_members
  add column if not exists status text not null default 'active' check (status in ('active', 'archived')),
  add column if not exists archived_at timestamptz;

create index if not exists household_members_household_id_status_idx
  on public.household_members(household_id, status, preferred_name);

create or replace function public.archive_household_member(
  target_member_id uuid
)
returns public.household_members
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row public.household_members;
  active_member_count integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in before archiving a family member.';
  end if;

  select *
  into member_row
  from public.household_members
  where id = target_member_id
  for update;

  if not found then
    raise exception 'Family member not found.';
  end if;

  if not public.is_household_admin(member_row.household_id) then
    raise exception 'Only household admins can archive family members.';
  end if;

  if member_row.status = 'archived' then
    return member_row;
  end if;

  select count(*)
  into active_member_count
  from public.household_members
  where household_id = member_row.household_id
    and status = 'active';

  if active_member_count <= 1 then
    raise exception 'Keep at least one active family member in the household.';
  end if;

  update public.household_members
  set status = 'archived',
      archived_at = now(),
      updated_at = now()
  where id = member_row.id
  returning * into member_row;

  return member_row;
end;
$$;

create or replace function public.restore_household_member(
  target_member_id uuid
)
returns public.household_members
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row public.household_members;
begin
  if auth.uid() is null then
    raise exception 'Sign in before restoring a family member.';
  end if;

  select *
  into member_row
  from public.household_members
  where id = target_member_id
  for update;

  if not found then
    raise exception 'Family member not found.';
  end if;

  if not public.is_household_admin(member_row.household_id) then
    raise exception 'Only household admins can restore family members.';
  end if;

  if member_row.status = 'active' then
    return member_row;
  end if;

  update public.household_members
  set status = 'active',
      archived_at = null,
      updated_at = now()
  where id = member_row.id
  returning * into member_row;

  return member_row;
end;
$$;

grant execute on function public.archive_household_member(uuid) to authenticated;
grant execute on function public.restore_household_member(uuid) to authenticated;
