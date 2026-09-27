-- Editable headline and subtitle over the hero photo. NULL = use the built-in default wording.
alter table public.site_settings add column if not exists hero_title text;
alter table public.site_settings add column if not exists hero_subtitle text;
