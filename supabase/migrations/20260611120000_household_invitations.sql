create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  invited_email text not null,
  role text not null check (role in ('parent', 'caregiver', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  accepted_by_auth_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index household_invitations_household_id_idx
  on public.household_invitations(household_id, created_at desc);

create unique index household_invitations_pending_email_idx
  on public.household_invitations(household_id, lower(invited_email))
  where status = 'pending';

create or replace function public.current_auth_email()
returns text
language sql
stable
as $$
  select lower(nullif(trim(auth.jwt() ->> 'email'), ''));
$$;

create or replace function public.invite_user_to_household(
  target_household_id uuid,
  invited_email text,
  invite_role text default 'parent'
)
returns public.household_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_auth_user_id uuid := auth.uid();
  normalized_email text := lower(nullif(trim(invited_email), ''));
  invitation public.household_invitations;
begin
  if current_auth_user_id is null then
    raise exception 'Sign in before inviting someone.';
  end if;

  if normalized_email is null then
    raise exception 'Invitation email is required.';
  end if;

  if invite_role not in ('parent', 'caregiver', 'viewer') then
    raise exception 'Invitation role must be parent, caregiver, or viewer.';
  end if;

  if not public.is_household_admin(target_household_id) then
    raise exception 'Only household admins can send invitations.';
  end if;

  if exists (
    select 1
    from public.household_users household_user
    join auth.users auth_user
      on auth_user.id = household_user.auth_user_id
    where household_user.household_id = target_household_id
      and lower(auth_user.email) = normalized_email
  ) then
    raise exception 'This email already has access to the household.';
  end if;

  select *
  into invitation
  from public.household_invitations
  where household_id = target_household_id
    and lower(public.household_invitations.invited_email) = normalized_email
    and status in ('pending', 'revoked')
  order by created_at desc
  limit 1
  for update;

  if found then
    update public.household_invitations
    set invited_email = normalized_email,
        role = invite_role,
        status = 'pending',
        invited_by_auth_user_id = current_auth_user_id,
        accepted_by_auth_user_id = null,
        accepted_at = null,
        revoked_at = null,
        updated_at = now()
    where id = invitation.id
    returning * into invitation;

    return invitation;
  end if;

  insert into public.household_invitations (
    household_id,
    invited_email,
    role,
    invited_by_auth_user_id
  )
  values (
    target_household_id,
    normalized_email,
    invite_role,
    current_auth_user_id
  )
  returning * into invitation;

  return invitation;
end;
$$;

create or replace function public.revoke_household_invitation(
  target_invitation_id uuid
)
returns public.household_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.household_invitations;
begin
  if auth.uid() is null then
    raise exception 'Sign in before revoking an invitation.';
  end if;

  select *
  into invitation
  from public.household_invitations
  where id = target_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found.';
  end if;

  if not public.is_household_admin(invitation.household_id) then
    raise exception 'Only household admins can revoke invitations.';
  end if;

  if invitation.status <> 'pending' then
    raise exception 'Only pending invitations can be revoked.';
  end if;

  update public.household_invitations
  set status = 'revoked',
      revoked_at = now(),
      updated_at = now()
  where id = invitation.id
  returning * into invitation;

  return invitation;
end;
$$;

create or replace function public.claim_household_invitations_for_current_user()
returns table (
  household_id uuid,
  household_name text,
  role text,
  invitation_id uuid,
  membership_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_auth_user_id uuid := auth.uid();
  normalized_email text := public.current_auth_email();
  invitation record;
  did_create_membership boolean;
begin
  if current_auth_user_id is null then
    raise exception 'Sign in before claiming invitations.';
  end if;

  if normalized_email is null then
    raise exception 'The signed-in account does not have an email address.';
  end if;

  for invitation in
    select
      household_invitation.id,
      household_invitation.household_id,
      household_invitation.role,
      household.name as household_name
    from public.household_invitations household_invitation
    join public.households household
      on household.id = household_invitation.household_id
    where household_invitation.status = 'pending'
      and lower(household_invitation.invited_email) = normalized_email
    order by household_invitation.created_at asc
  loop
    did_create_membership := false;

    if not exists (
      select 1
      from public.household_users household_user
      where household_user.household_id = invitation.household_id
        and household_user.auth_user_id = current_auth_user_id
    ) then
      insert into public.household_users (
        household_id,
        auth_user_id,
        role
      )
      values (
        invitation.household_id,
        current_auth_user_id,
        invitation.role
      );

      did_create_membership := true;
    end if;

    update public.household_invitations
    set status = 'accepted',
        accepted_by_auth_user_id = current_auth_user_id,
        accepted_at = now(),
        updated_at = now()
    where id = invitation.id;

    household_id := invitation.household_id;
    household_name := invitation.household_name;
    role := invitation.role;
    invitation_id := invitation.id;
    membership_created := did_create_membership;
    return next;
  end loop;
end;
$$;

create or replace function public.get_household_access_state(target_household_id uuid)
returns table (
  entry_type text,
  entry_id uuid,
  email text,
  role text,
  status text,
  auth_user_id uuid,
  invited_by_email text,
  created_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in before loading household access.';
  end if;

  if not public.is_household_admin(target_household_id) then
    raise exception 'Only household admins can load household access.';
  end if;

  return query
    select
      'member'::text as entry_type,
      household_user.auth_user_id as entry_id,
      lower(auth_user.email) as email,
      household_user.role,
      'active'::text as status,
      household_user.auth_user_id,
      null::text as invited_by_email,
      household_user.created_at,
      null::timestamptz as accepted_at
    from public.household_users household_user
    join auth.users auth_user
      on auth_user.id = household_user.auth_user_id
    where household_user.household_id = target_household_id

    union all

    select
      'invitation'::text as entry_type,
      household_invitation.id as entry_id,
      lower(household_invitation.invited_email) as email,
      household_invitation.role,
      household_invitation.status,
      household_invitation.accepted_by_auth_user_id as auth_user_id,
      lower(invited_by_auth_user.email) as invited_by_email,
      household_invitation.created_at,
      household_invitation.accepted_at
    from public.household_invitations household_invitation
    left join auth.users invited_by_auth_user
      on invited_by_auth_user.id = household_invitation.invited_by_auth_user_id
    where household_invitation.household_id = target_household_id
      and household_invitation.status = 'pending';
end;
$$;

grant execute on function public.current_auth_email() to authenticated;
grant execute on function public.invite_user_to_household(uuid, text, text) to authenticated;
grant execute on function public.revoke_household_invitation(uuid) to authenticated;
grant execute on function public.claim_household_invitations_for_current_user() to authenticated;
grant execute on function public.get_household_access_state(uuid) to authenticated;

revoke all on public.household_invitations from anon;
grant select, insert, update, delete on public.household_invitations to authenticated;

alter table public.household_invitations enable row level security;

create policy "Household admins can read invitations"
  on public.household_invitations
  for select
  to authenticated
  using (public.is_household_admin(household_id));

create policy "Household admins can manage invitations"
  on public.household_invitations
  for all
  to authenticated
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));
