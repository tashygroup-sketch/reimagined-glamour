alter table public.menu_items
  add column if not exists image_ratio numeric,
  add column if not exists extra_image_ratios numeric[] not null default '{}';

alter table public.promotions add column if not exists ratio numeric;
