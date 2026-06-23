create or replace function public.cancel_allowance_request_entry(target_request_id uuid)
returns table (
  request_id uuid,
  cancelled_chore_completion_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.allowance_request_entries%rowtype;
  requested_chore_completion_id uuid;
begin
  select *
  into request_row
  from public.allowance_request_entries
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Allowance request not found.';
  end if;

  if not public.is_household_user(request_row.household_id) then
    raise exception 'Only household users can cancel allowance requests.';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Allowance request is no longer pending.';
  end if;

  begin
    requested_chore_completion_id := nullif(request_row.metadata->>'choreCompletionId', '')::uuid;
  exception
    when others then
      requested_chore_completion_id := null;
  end;

  if requested_chore_completion_id is not null then
    delete from public.chore_completions
    where household_id = request_row.household_id
      and id = requested_chore_completion_id;

    if not found then
      requested_chore_completion_id := null;
    end if;
  end if;

  delete from public.allowance_request_entries
  where id = request_row.id;

  return query
  select
    request_row.id,
    requested_chore_completion_id;
end;
$$;

grant execute on function public.cancel_allowance_request_entry(uuid) to authenticated;

create or replace function public.reject_allowance_request_entry(target_request_id uuid)
returns table (
  request_id uuid,
  rejected_chore_completion_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.allowance_request_entries%rowtype;
  requested_chore_completion_id uuid;
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
    raise exception 'Only household admins can reject allowance requests.';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Allowance request is no longer pending.';
  end if;

  begin
    requested_chore_completion_id := nullif(request_row.metadata->>'choreCompletionId', '')::uuid;
  exception
    when others then
      requested_chore_completion_id := null;
  end;

  if requested_chore_completion_id is not null then
    delete from public.chore_completions
    where household_id = request_row.household_id
      and id = requested_chore_completion_id;

    if not found then
      requested_chore_completion_id := null;
    end if;
  end if;

  update public.allowance_request_entries
  set status = 'rejected',
      rejected_at = now(),
      updated_at = now()
  where id = request_row.id;

  return query
  select
    request_row.id,
    requested_chore_completion_id;
end;
$$;

grant execute on function public.reject_allowance_request_entry(uuid) to authenticated;
