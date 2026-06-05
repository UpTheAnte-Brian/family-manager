create or replace function public.claim_default_household_owner()
returns public.household_users
language plpgsql
security definer
set search_path = public
as $$
declare
  default_household_id uuid := '00000000-0000-0000-0000-000000000001';
  current_auth_user_id uuid := auth.uid();
  membership public.household_users;
begin
  if current_auth_user_id is null then
    raise exception 'Sign in before claiming a household.';
  end if;

  select *
  into membership
  from public.household_users
  where household_id = default_household_id
    and auth_user_id = current_auth_user_id;

  if found then
    return membership;
  end if;

  if exists (
    select 1
    from public.household_users
    where household_id = default_household_id
  ) then
    raise exception 'This household already has an owner.';
  end if;

  insert into public.household_users (
    household_id,
    auth_user_id,
    role
  )
  values (
    default_household_id,
    current_auth_user_id,
    'owner'
  )
  returning * into membership;

  return membership;
end;
$$;

grant execute on function public.claim_default_household_owner() to authenticated;
