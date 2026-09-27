alter table public.menu_items add column if not exists extra_images text[] not null default '{}';
