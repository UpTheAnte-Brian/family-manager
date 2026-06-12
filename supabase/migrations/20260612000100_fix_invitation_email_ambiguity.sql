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
  from public.household_invitations household_invitation
  where household_invitation.household_id = target_household_id
    and lower(household_invitation.invited_email) = normalized_email
    and household_invitation.status in ('pending', 'revoked')
  order by household_invitation.created_at desc
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
