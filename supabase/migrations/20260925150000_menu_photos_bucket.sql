-- Storage bucket for menu item photos uploaded from the admin panel.
-- Uploads always go through the uploadMenuImage server function using the service-role
-- (admin) client, which bypasses RLS — so no INSERT/UPDATE policy is needed here, only a
-- public SELECT policy so uploaded photos can be displayed on the site.
insert into storage.buckets (id, name, public)
values ('menu-photos', 'menu-photos', true)
on conflict (id) do nothing;

create policy "Menu photos are publicly viewable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'menu-photos');
