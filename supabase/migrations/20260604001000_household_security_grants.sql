grant usage on schema public to authenticated;

revoke all on public.households from anon;
revoke all on public.household_users from anon;
revoke all on public.household_members from anon;
revoke all on public.calendar_sources from anon;
revoke all on public.calendar_events from anon;
revoke all on public.household_action_items from anon;
revoke all on public.household_assignments from anon;
revoke all on public.household_action_item_completions from anon;
revoke all on public.chores from anon;
revoke all on public.chore_assignment_templates from anon;
revoke all on public.chore_completions from anon;
revoke all on public.household_app_state from anon;

grant select, insert, update, delete on public.households to authenticated;
grant select, insert, update, delete on public.household_users to authenticated;
grant select, insert, update, delete on public.household_members to authenticated;
grant select, insert, update, delete on public.calendar_sources to authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;
grant select, insert, update, delete on public.household_action_items to authenticated;
grant select, insert, update, delete on public.household_assignments to authenticated;
grant select, insert, update, delete on public.household_action_item_completions to authenticated;
grant select, insert, update, delete on public.chores to authenticated;
grant select, insert, update, delete on public.chore_assignment_templates to authenticated;
grant select, insert, update, delete on public.chore_completions to authenticated;
grant select, insert, update, delete on public.household_app_state to authenticated;

grant execute on function public.is_household_user(uuid) to authenticated;
grant execute on function public.is_household_admin(uuid) to authenticated;

drop policy if exists "Allow anonymous household app state reads"
  on public.household_app_state;
drop policy if exists "Allow anonymous household app state inserts"
  on public.household_app_state;
drop policy if exists "Allow anonymous household app state updates"
  on public.household_app_state;
drop policy if exists "Household users can read app state"
  on public.household_app_state;
drop policy if exists "Household users can insert app state"
  on public.household_app_state;
drop policy if exists "Household users can update app state"
  on public.household_app_state;

create policy "Household users can read app state"
  on public.household_app_state
  for select
  to authenticated
  using (public.is_household_user(household_id));

create policy "Household users can insert app state"
  on public.household_app_state
  for insert
  to authenticated
  with check (public.is_household_user(household_id));

create policy "Household users can update app state"
  on public.household_app_state
  for update
  to authenticated
  using (public.is_household_user(household_id))
  with check (public.is_household_user(household_id));
