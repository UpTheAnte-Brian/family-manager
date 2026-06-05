drop function if exists public.claim_default_household_owner();

drop table if exists public.household_app_state;

delete from public.households
where id = '00000000-0000-0000-0000-000000000001'
  and not exists (
    select 1
    from public.household_users
    where household_id = '00000000-0000-0000-0000-000000000001'
  );

create or replace function public.create_household_for_current_user(
  household_name text,
  household_timezone text default 'America/Chicago'
)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  current_auth_user_id uuid := auth.uid();
  created_household public.households;
begin
  if current_auth_user_id is null then
    raise exception 'Sign in before creating a household.';
  end if;

  if nullif(trim(household_name), '') is null then
    raise exception 'Household name is required.';
  end if;

  insert into public.households (
    name,
    timezone
  )
  values (
    trim(household_name),
    coalesce(nullif(trim(household_timezone), ''), 'America/Chicago')
  )
  returning * into created_household;

  insert into public.household_users (
    household_id,
    auth_user_id,
    role
  )
  values (
    created_household.id,
    current_auth_user_id,
    'owner'
  );

  return created_household;
end;
$$;

grant execute on function public.create_household_for_current_user(text, text) to authenticated;
