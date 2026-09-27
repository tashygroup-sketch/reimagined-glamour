-- Run this once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to run more than once.

-- 1) Each product keeps its own variables (e.g. اللون → أحمر/نود, المقاس → S/XL), each value
--    with an optional photo. Shape:
--    [{"name":"اللون","values":[{"label":"أحمر","image_url":"https://..."}]}]
--    An empty list means the product has no variables and is added to the cart directly.
alter table public.menu_items
  add column if not exists variables jsonb not null default '[]'::jsonb;

-- 2) Category photos for the category squares on the home page. Categories themselves still
--    come from the products (menu_items.category); this table only adds a photo to a name.
create table if not exists public.categories (
  name text primary key,
  image_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

grant select on public.categories to anon, authenticated;
grant all on public.categories to service_role;

alter table public.categories enable row level security;

drop policy if exists "Categories public read" on public.categories;
create policy "Categories public read" on public.categories
  for select to anon, authenticated using (true);

-- The old shared "product_variables" table (the separate المتغيرات tab) is no longer used by
-- the site. It is left in place so nothing is deleted by surprise; drop it any time with:
--   drop table if exists public.product_variables;
