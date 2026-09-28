-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to run more than once.

-- 1) Minimum order quantity per product ("أقل كمية يمكن طلبها"). 1 = no minimum.
alter table public.menu_items
  add column if not exists min_qty integer not null default 1 check (min_qty >= 1);

-- 2) One discount code per product. Kept in its own table with NO public read access, so the
--    codes can't be pulled from the browser with the public key — only the server (service
--    role) reads them, and the site only ever learns "this product has a code" + when it ends.
create table if not exists public.product_discounts (
  product_id uuid primary key references public.menu_items(id) on delete cascade,
  code text not null,
  discount_price numeric(10,2) not null check (discount_price >= 0),
  ends_at timestamptz, -- null = no end time
  updated_at timestamptz not null default now()
);

alter table public.product_discounts enable row level security;
revoke all on public.product_discounts from anon, authenticated;
grant all on public.product_discounts to service_role;
-- Deliberately no "create policy" here: with RLS on and no policy, anon/authenticated see nothing.
