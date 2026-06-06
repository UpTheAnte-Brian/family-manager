create table if not exists public.chore_categories (
  id text primary key,
  label text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.chore_categories (id, label, sort_order)
values
  ('yard', 'Yard', 10),
  ('pets', 'Pets', 20),
  ('kitchen', 'Kitchen', 30),
  ('house-reset', 'House reset', 40),
  ('laundry', 'Laundry', 50),
  ('personal-hygiene', 'Personal hygiene', 60)
on conflict (id) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order,
  updated_at = now();

grant select on public.chore_categories to anon, authenticated;

alter table public.chore_categories enable row level security;

drop policy if exists "Anyone can read chore categories" on public.chore_categories;

create policy "Anyone can read chore categories"
  on public.chore_categories
  for select
  using (true);

comment on table public.chore_categories is
  'Global reference list for chore category values. Chores store the category id in chores.category_id.';

alter table public.chores
  add column if not exists category_id text;

update public.chores
set category_id = 'house-reset'
where category_id is null;

alter table public.chores
  alter column category_id set default 'house-reset',
  alter column category_id set not null;

do $$
begin
  alter table public.chores
    add constraint chores_category_id_fkey
    foreign key (category_id)
    references public.chore_categories(id);
exception
  when duplicate_object then null;
end $$;
