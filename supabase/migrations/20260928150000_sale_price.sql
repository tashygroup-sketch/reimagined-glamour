-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to run more than once.
-- Regular discount visible to everyone (no code): customers see the price struck through
-- ("was") and pay sale_price. null = no discount.
alter table public.menu_items
  add column if not exists sale_price numeric(10,2) check (sale_price >= 0);
