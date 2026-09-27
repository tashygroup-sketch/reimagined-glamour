-- Stock: NULL means "not tracked / unlimited", so existing items don't suddenly show as sold out.
alter table public.menu_items add column if not exists stock integer;

-- Hero background photo for the top of the home page (NULL = keep the pink gradient).
alter table public.site_settings add column if not exists hero_image_url text;

-- Atomically checks and deducts stock for every item in an order. Runs as one transaction:
-- if any item doesn't have enough stock, nothing is deducted at all. Rows are locked while
-- checked, so two customers can't both buy the last piece at the same moment.
create or replace function public.reserve_stock(p_items jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  it jsonb;
  v_id uuid;
  v_qty integer;
  v_stock integer;
  v_name text;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    v_id := (it->>'id')::uuid;
    v_qty := greatest(coalesce((it->>'qty')::integer, 0), 0);

    select stock, name into v_stock, v_name
    from public.menu_items
    where id = v_id
    for update;

    if not found then
      raise exception 'ITEM_NOT_FOUND';
    end if;

    if v_stock is not null then
      if v_stock < v_qty then
        raise exception 'OUT_OF_STOCK:%', v_name;
      end if;
      update public.menu_items set stock = v_stock - v_qty where id = v_id;
    end if;
  end loop;
end;
$$;

-- Only the server (service role) may call this. Without this, anyone with the public key
-- could call it directly and drain the stock to zero.
revoke all on function public.reserve_stock(jsonb) from public;
revoke all on function public.reserve_stock(jsonb) from anon, authenticated;
grant execute on function public.reserve_stock(jsonb) to service_role;
