alter table public.households
  add column address_line1 text,
  add column address_line2 text,
  add column locality text,
  add column administrative_area text,
  add column postal_code text,
  add column country_code text,
  add column formatted_address text,
  add column google_place_id text,
  add column latitude double precision,
  add column longitude double precision;

create unique index households_google_place_id_idx
  on public.households(google_place_id)
  where google_place_id is not null;

create index households_latitude_longitude_idx
  on public.households(latitude, longitude)
  where latitude is not null and longitude is not null;

create table public.platform_admins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index platform_admins_email_idx
  on public.platform_admins(lower(email));

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where auth_user_id = auth.uid()
  );
$$;

create or replace function public.get_platform_household_map()
returns table (
  household_id uuid,
  household_name text,
  timezone text,
  formatted_address text,
  locality text,
  administrative_area text,
  postal_code text,
  country_code text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in before loading platform households.';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Only platform admins can load household locations.';
  end if;

  return query
    select
      household.id as household_id,
      household.name as household_name,
      household.timezone,
      household.formatted_address,
      household.locality,
      household.administrative_area,
      household.postal_code,
      household.country_code,
      household.latitude,
      household.longitude,
      household.created_at
    from public.households household
    order by household.created_at desc, household.name asc;
end;
$$;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.get_platform_household_map() to authenticated;

revoke all on public.platform_admins from anon;
revoke all on public.platform_admins from authenticated;

alter table public.platform_admins enable row level security;

create policy "Platform admins can read platform admins"
  on public.platform_admins
  for select
  to authenticated
  using (public.is_platform_admin());
