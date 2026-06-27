alter table public.allowance_entries
  drop constraint if exists allowance_entries_chore_completion_id_key;

create index if not exists allowance_entries_chore_completion_id_idx
  on public.allowance_entries(chore_completion_id)
  where chore_completion_id is not null;

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
  split_target_member public.household_members%rowtype;
  existing_chore public.chores%rowtype;
  resolved_chore_completion public.chore_completions%rowtype;
  existing_allowance_entry public.allowance_entries%rowtype;
  resolved_chore_id uuid;
  resolved_allowance_entry_id uuid;
  approving_member_id uuid;
  occurred_timestamp timestamptz;
  requested_chore_completion_id uuid;
  signed_amount_cents integer;
  primary_amount_cents integer;
  resolved_entry_type text;
  split_allocation jsonb;
  split_member_id uuid;
  split_amount_cents integer;
  split_total_cents integer := 0;
  seen_split_member_ids uuid[] := array[]::uuid[];
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

  if request_row.request_kind not in ('credit', 'debit') then
    raise exception 'Allowance request kind is invalid.';
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

  if request_row.metadata ? 'splitAllocations'
    and jsonb_typeof(request_row.metadata->'splitAllocations') <> 'array' then
    raise exception 'Split rewards are malformed.';
  end if;

  if request_row.request_kind = 'credit' then
    for split_allocation in
      select value
      from jsonb_array_elements(coalesce(request_row.metadata->'splitAllocations', '[]'::jsonb))
    loop
      begin
        split_member_id := nullif(split_allocation->>'householdMemberId', '')::uuid;
      exception
        when others then
          raise exception 'Split reward member is invalid.';
      end;

      begin
        split_amount_cents := (split_allocation->>'amountCents')::integer;
      exception
        when others then
          raise exception 'Split reward amount is invalid.';
      end;

      if split_member_id is null or split_member_id = request_row.household_member_id then
        raise exception 'Split rewards must target a different child.';
      end if;

      if split_amount_cents is null or split_amount_cents <= 0 then
        raise exception 'Split reward amount must be greater than zero.';
      end if;

      if split_member_id = any(seen_split_member_ids) then
        raise exception 'Each child can only receive one split reward amount.';
      end if;

      select *
      into split_target_member
      from public.household_members
      where household_id = request_row.household_id
        and id = split_member_id;

      if not found or split_target_member.role <> 'child' then
        raise exception 'Split rewards must target a child profile.';
      end if;

      seen_split_member_ids := array_append(seen_split_member_ids, split_member_id);
      split_total_cents := split_total_cents + split_amount_cents;
    end loop;

    if split_total_cents >= request_row.requested_amount_cents then
      raise exception 'Split rewards must leave at least $0.01 for the original child.';
    end if;
  elsif jsonb_array_length(coalesce(request_row.metadata->'splitAllocations', '[]'::jsonb)) > 0 then
    raise exception 'Only credit requests can use split rewards.';
  end if;

  begin
    requested_chore_completion_id := nullif(request_row.metadata->>'choreCompletionId', '')::uuid;
  exception
    when others then
      requested_chore_completion_id := null;
  end;

  resolved_chore_id := request_row.chore_id;
  occurred_timestamp := request_row.requested_at;

  if requested_chore_completion_id is not null then
    select *
    into resolved_chore_completion
    from public.chore_completions
    where household_id = request_row.household_id
      and id = requested_chore_completion_id
      and completed_by_member_id = request_row.household_member_id;

    if found then
      resolved_chore_id := coalesce(resolved_chore_id, resolved_chore_completion.chore_id);
      occurred_timestamp := resolved_chore_completion.completed_at;
    else
      requested_chore_completion_id := null;
    end if;
  end if;

  if request_row.request_kind = 'credit' and resolved_chore_id is null then
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
  elsif request_row.request_kind = 'debit' then
    resolved_chore_id := null;
    requested_chore_completion_id := null;
  end if;

  signed_amount_cents :=
    case
      when request_row.request_kind = 'debit' then request_row.requested_amount_cents * -1
      else request_row.requested_amount_cents
    end;
  primary_amount_cents :=
    case
      when request_row.request_kind = 'credit' then request_row.requested_amount_cents - split_total_cents
      else signed_amount_cents
    end;

  resolved_entry_type :=
    case
      when request_row.request_kind = 'credit' and requested_chore_completion_id is not null then 'chore_completion'
      else 'manual_adjustment'
    end;

  existing_allowance_entry := null;

  if requested_chore_completion_id is not null then
    select *
    into existing_allowance_entry
    from public.allowance_entries
    where chore_completion_id = requested_chore_completion_id
      and household_member_id = request_row.household_member_id
    order by created_at asc
    limit 1;
  end if;

  if existing_allowance_entry.id is not null then
    update public.allowance_entries
    set household_member_id = request_row.household_member_id,
        chore_completion_id = requested_chore_completion_id,
        chore_id = resolved_chore_id,
        entry_type = resolved_entry_type,
        amount_cents = primary_amount_cents,
        occurred_at = occurred_timestamp,
        metadata = jsonb_strip_nulls(
          coalesce(existing_allowance_entry.metadata, '{}'::jsonb) ||
          jsonb_build_object(
            'allowanceRequestId',
            request_row.id,
            'assignmentTemplateId',
            nullif(request_row.metadata->>'assignmentTemplateId', ''),
            'choreTitle',
            request_row.chore_title,
            'label',
            request_row.chore_title,
            'note',
            request_row.note,
            'requestKind',
            request_row.request_kind
          )
        ),
        updated_at = now()
    where id = existing_allowance_entry.id
    returning id into resolved_allowance_entry_id;
  else
    insert into public.allowance_entries (
      household_id,
      household_member_id,
      chore_completion_id,
      chore_id,
      entry_type,
      amount_cents,
      occurred_at,
      metadata
    )
    values (
      request_row.household_id,
      request_row.household_member_id,
      requested_chore_completion_id,
      resolved_chore_id,
      resolved_entry_type,
      primary_amount_cents,
      occurred_timestamp,
      jsonb_strip_nulls(
        jsonb_build_object(
          'allowanceRequestId',
          request_row.id,
          'assignmentTemplateId',
          nullif(request_row.metadata->>'assignmentTemplateId', ''),
          'choreTitle',
          request_row.chore_title,
          'label',
          request_row.chore_title,
          'note',
          request_row.note,
          'requestKind',
          request_row.request_kind
        )
      )
    )
    returning id into resolved_allowance_entry_id;
  end if;

  if request_row.request_kind = 'credit' and split_total_cents > 0 then
    for split_allocation in
      select value
      from jsonb_array_elements(coalesce(request_row.metadata->'splitAllocations', '[]'::jsonb))
    loop
      split_member_id := nullif(split_allocation->>'householdMemberId', '')::uuid;
      split_amount_cents := (split_allocation->>'amountCents')::integer;

      insert into public.allowance_entries (
        household_id,
        household_member_id,
        chore_completion_id,
        chore_id,
        entry_type,
        amount_cents,
        occurred_at,
        metadata
      )
      values (
        request_row.household_id,
        split_member_id,
        requested_chore_completion_id,
        resolved_chore_id,
        'manual_adjustment',
        split_amount_cents,
        occurred_timestamp,
        jsonb_strip_nulls(
          jsonb_build_object(
            'allowanceRequestId',
            request_row.id,
            'assignmentTemplateId',
            nullif(request_row.metadata->>'assignmentTemplateId', ''),
            'choreTitle',
            request_row.chore_title,
            'label',
            request_row.chore_title,
            'note',
            request_row.note,
            'requestKind',
            request_row.request_kind,
            'splitFromHouseholdMemberId',
            request_row.household_member_id
          )
        )
      );
    end loop;
  end if;

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
    primary_amount_cents,
    occurred_timestamp;
end;
$$;
