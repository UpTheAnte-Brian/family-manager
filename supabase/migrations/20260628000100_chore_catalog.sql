create table if not exists public.chore_catalog (
  id text primary key,
  title text not null check (btrim(title) <> ''),
  description text,
  category_id text not null references public.chore_categories(id),
  estimated_minutes integer not null default 10 check (estimated_minutes > 0),
  default_allowance_amount numeric(12,2),
  definition_of_done text,
  suggested_money_talk text,
  requires_adult_check boolean not null default false,
  age_min integer check (age_min is null or age_min between 0 and 17),
  age_max integer check (age_max is null or age_max between 0 and 17),
  sort_order integer not null default 100,
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max)
);

comment on table public.chore_catalog is
  'Global curated chore catalog that households can browse and import into their own chores.';

alter table public.chores
  add column if not exists catalog_chore_id text,
  add column if not exists source_kind text not null default 'custom';

update public.chores
set source_kind = 'custom'
where source_kind is null;

alter table public.chores
  alter column source_kind set default 'custom',
  alter column source_kind set not null;

do $$
begin
  alter table public.chores
    add constraint chores_catalog_chore_id_fkey
    foreign key (catalog_chore_id)
    references public.chore_catalog(id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.chores
    add constraint chores_source_kind_check
    check (source_kind in ('custom', 'catalog', 'seeded'));
exception
  when duplicate_object then null;
end $$;

create unique index if not exists chores_household_catalog_unique_idx
  on public.chores(household_id, catalog_chore_id)
  where catalog_chore_id is not null;

insert into public.chore_catalog (
  id,
  title,
  description,
  category_id,
  estimated_minutes,
  default_allowance_amount,
  definition_of_done,
  suggested_money_talk,
  requires_adult_check,
  age_min,
  age_max,
  sort_order
)
values
  (
    'empty-dishwasher',
    'Empty dishwasher',
    'Put away the clean dishes and silverware after a cycle finishes.',
    'kitchen',
    10,
    0.50,
    'All clean dishes are put away and the silverware tray is empty.',
    null,
    false,
    7,
    10,
    10
  ),
  (
    'walk-dog',
    'Walk the dog',
    'Take the dog for a normal walk and return with leash and supplies put away.',
    'pets',
    15,
    null,
    'The dog is walked safely and returns home calm, with the leash put back.',
    null,
    true,
    7,
    10,
    20
  ),
  (
    'feed-dog',
    'Feed the dog',
    'Give the dog the correct meal and refill water if needed.',
    'pets',
    5,
    null,
    'Food is served correctly and the feeding area is left clean.',
    null,
    false,
    5,
    10,
    30
  ),
  (
    'set-table',
    'Set the table',
    'Lay out the plates, cups, napkins, and utensils needed for the meal.',
    'kitchen',
    5,
    null,
    'Each place setting is ready before the meal starts.',
    null,
    false,
    5,
    8,
    40
  ),
  (
    'clear-table',
    'Clear the table',
    'Carry dishes away after the meal and leave the table ready to wipe down.',
    'kitchen',
    8,
    null,
    'Dirty dishes are removed and leftover food is put where a parent expects it.',
    null,
    false,
    5,
    8,
    50
  ),
  (
    'living-room-reset',
    'Living room reset',
    'Return living room items to their normal spots and straighten the main surfaces.',
    'house-reset',
    10,
    null,
    'Pillows, blankets, toys, and books are back where they belong.',
    null,
    false,
    5,
    10,
    60
  ),
  (
    'toy-reset',
    'Toy reset',
    'Pick up toys and return them to bins, shelves, or their storage area.',
    'house-reset',
    10,
    null,
    'The floor is clear and toys are back in their usual storage spots.',
    null,
    false,
    5,
    8,
    70
  ),
  (
    'trash-small-cans',
    'Empty small trash cans',
    'Empty bedroom or bathroom trash cans into the larger household bin.',
    'house-reset',
    10,
    null,
    'The small cans are emptied and any liner is replaced if needed.',
    null,
    false,
    5,
    8,
    80
  ),
  (
    'organize-bedroom',
    'Organize bedroom',
    'Tidy toys, books, and clothes so the room is ready for the next part of the day.',
    'house-reset',
    10,
    null,
    'Toys, books, and clothes are back in their places and the floor is clear.',
    null,
    false,
    5,
    8,
    90
  ),
  (
    'put-away-laundry',
    'Put away clean laundry',
    'Folded or clean laundry is returned to the correct drawers or closet spots.',
    'laundry',
    10,
    null,
    'Clean clothes are folded or hung and put into the right drawers or closets.',
    null,
    false,
    7,
    10,
    100
  ),
  (
    'sweep-floors',
    'Sweep kitchen or playroom floor',
    'Sweep up visible crumbs and dirt from a common floor area.',
    'house-reset',
    10,
    null,
    'Visible crumbs and dirt are swept up and the dustpan is emptied.',
    null,
    false,
    7,
    8,
    110
  ),
  (
    'dust-furniture',
    'Dust furniture and baseboards',
    'Dust reachable shelves, furniture, and baseboards with a cloth or duster.',
    'house-reset',
    10,
    null,
    'Dust the reachable surfaces and leave the cloth in the laundry.',
    null,
    false,
    5,
    10,
    120
  ),
  (
    'wipe-counters',
    'Wipe kitchen counters',
    'Wipe counters after snacks or meals so the prep area is ready to use again.',
    'kitchen',
    5,
    null,
    'Counters are wiped clean after meals or snack prep.',
    null,
    false,
    7,
    10,
    130
  ),
  (
    'put-away-groceries',
    'Put away groceries',
    'Put pantry, fridge, and freezer items in the correct places after shopping.',
    'kitchen',
    10,
    null,
    'Pantry and fridge items are put into the correct places.',
    null,
    false,
    7,
    8,
    140
  ),
  (
    'water-flowers',
    'Water plants or flowers',
    'Water outdoor pots, beds, or household plants evenly without overwatering them.',
    'yard',
    10,
    null,
    'Outdoor pots or beds are watered evenly without flooding them.',
    null,
    false,
    9,
    10,
    150
  ),
  (
    'start-laundry',
    'Start a load of laundry',
    'Sort clothes, measure detergent with help, and start the washer.',
    'laundry',
    10,
    null,
    'Clothes are sorted, detergent is measured with help, and the washer is started.',
    null,
    true,
    9,
    10,
    160
  ),
  (
    'pick-rocks-grass',
    'Pick rocks out of the grass',
    'Collect rocks from the yard and keep count if the family uses a per-rock reward.',
    'yard',
    20,
    null,
    'Bucket with the rocks in it and the total count.',
    '2 cents / rock. No cheating.',
    true,
    null,
    null,
    170
  ),
  (
    'pick-up-dog-poop',
    'Pick up dog poop',
    'Clean up the yard after the dog and dispose of waste the right way.',
    'pets',
    10,
    null,
    'The visible dog waste is picked up and the cleanup tools are put away.',
    null,
    true,
    null,
    null,
    180
  ),
  (
    'blow-off-trampoline',
    'Blow off the trampoline',
    'Clear leaves and debris from the trampoline before it is used.',
    'yard',
    10,
    null,
    'The trampoline surface is cleared and ready to use.',
    null,
    false,
    null,
    null,
    190
  )
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  category_id = excluded.category_id,
  estimated_minutes = excluded.estimated_minutes,
  default_allowance_amount = excluded.default_allowance_amount,
  definition_of_done = excluded.definition_of_done,
  suggested_money_talk = excluded.suggested_money_talk,
  requires_adult_check = excluded.requires_adult_check,
  age_min = excluded.age_min,
  age_max = excluded.age_max,
  sort_order = excluded.sort_order,
  status = 'active',
  updated_at = now();

grant select on public.chore_catalog to anon, authenticated;

alter table public.chore_catalog enable row level security;

drop policy if exists "Anyone can read chore catalog" on public.chore_catalog;

create policy "Anyone can read chore catalog"
  on public.chore_catalog
  for select
  using (true);
