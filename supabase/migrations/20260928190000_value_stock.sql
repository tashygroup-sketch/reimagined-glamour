-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to run more than once.
--
-- Quantity per value (أحمر: 2، أزرق: 0 …). Nothing new is stored in a new column: each value
-- inside menu_items.variables just gets a "stock" number, e.g.
--   [{"name":"اللون","values":[{"label":"أزرق","image_url":null,"stock":2}]}]
-- (no "stock", or null = that value isn't counted / unlimited).
--
-- menu_items.stock stays the product's total. When any value has a quantity, the total is
-- the smallest per-variable sum — every piece takes one colour AND one size, so
-- colours 2 + sizes 3 = 2 pieces.
--
-- This function replaces reserve_stock for orders: in one transaction it checks and deducts
-- every chosen value AND the product total. If anything is short, nothing is deducted.

create or replace function public.reserve_stock_v2(p_items jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_name text;
  v_stock integer;
  v_vars jsonb;
  v_line jsonb;
  v_opt jsonb;
  v_qty integer;
  v_total integer;
  v_has_value_stock boolean;
  v_vi integer;
  v_xi integer;
  v_cur jsonb;
  v_left integer;
  v_min integer;
  v_sum integer;
  v_tracked boolean;
  v_var jsonb;
  v_val jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return;
  end if;

  select coalesce(array_agg(distinct (e->>'id')::uuid), '{}')
    into v_ids
  from jsonb_array_elements(p_items) e
  where coalesce(e->>'id', '') <> '';

  -- Lock every product in the order, always in the same order, so two customers buying the
  -- last pieces at the same moment can't both succeed (and can't deadlock each other).
  perform 1 from public.menu_items where id = any(v_ids) order by id for update;

  foreach v_id in array v_ids loop
    select name, stock, coalesce(variables, '[]'::jsonb)
      into v_name, v_stock, v_vars
    from public.menu_items
    where id = v_id;

    if not found then
      raise exception 'ITEM_NOT_FOUND';
    end if;

    if jsonb_typeof(v_vars) <> 'array' then
      v_vars := '[]'::jsonb;
    end if;

    select exists (
      select 1
      from jsonb_array_elements(v_vars) var,
           jsonb_array_elements(
             case when jsonb_typeof(var->'values') = 'array' then var->'values' else '[]'::jsonb end
           ) val
      where jsonb_typeof(val->'stock') = 'number'
    ) into v_has_value_stock;

    v_total := 0;
    for v_line in
      select e from jsonb_array_elements(p_items) e
      where coalesce(e->>'id', '') <> '' and (e->>'id')::uuid = v_id
    loop
      v_qty := greatest(coalesce((v_line->>'qty')::integer, 0), 0);
      v_total := v_total + v_qty;

      if v_has_value_stock and v_qty > 0 and jsonb_typeof(v_line->'options') = 'array' then
        for v_opt in select o from jsonb_array_elements(v_line->'options') o loop
          v_cur := null;
          select (vv.ord - 1)::integer, (xv.ord - 1)::integer, xv.val
            into v_vi, v_xi, v_cur
          from jsonb_array_elements(v_vars) with ordinality as vv(var, ord),
               jsonb_array_elements(
                 case when jsonb_typeof(vv.var->'values') = 'array' then vv.var->'values' else '[]'::jsonb end
               ) with ordinality as xv(val, ord)
          where vv.var->>'name' = v_opt->>'name'
            and xv.val->>'label' = v_opt->>'value'
          limit 1;

          if v_cur is not null and jsonb_typeof(v_cur->'stock') = 'number' then
            v_left := (v_cur->>'stock')::numeric::integer - v_qty;
            if v_left < 0 then
              raise exception 'OUT_OF_STOCK:%', v_name || ' (' || (v_opt->>'value') || ')';
            end if;
            v_vars := jsonb_set(
              v_vars,
              array[v_vi::text, 'values', v_xi::text, 'stock'],
              to_jsonb(v_left)
            );
          end if;
        end loop;
      end if;
    end loop;

    if v_has_value_stock then
      -- Product total = the smallest sum among variables whose values are all counted.
      v_min := null;
      for v_var in select var from jsonb_array_elements(v_vars) var loop
        v_sum := 0;
        v_tracked := jsonb_typeof(v_var->'values') = 'array'
                     and jsonb_array_length(v_var->'values') > 0;
        if v_tracked then
          for v_val in select val from jsonb_array_elements(v_var->'values') val loop
            if jsonb_typeof(v_val->'stock') = 'number' then
              v_sum := v_sum + (v_val->>'stock')::numeric::integer;
            else
              v_tracked := false;
            end if;
          end loop;
        end if;
        if v_tracked and (v_min is null or v_sum < v_min) then
          v_min := v_sum;
        end if;
      end loop;
      update public.menu_items set variables = v_vars, stock = v_min where id = v_id;
    elsif v_stock is not null then
      if v_stock < v_total then
        raise exception 'OUT_OF_STOCK:%', v_name;
      end if;
      update public.menu_items set stock = v_stock - v_total where id = v_id;
    end if;
  end loop;
end;
$$;

-- Only the server (service role) may call this. Without this, anyone with the public key
-- could call it directly and drain the stock to zero.
revoke all on function public.reserve_stock_v2(jsonb) from public;
revoke all on function public.reserve_stock_v2(jsonb) from anon, authenticated;
grant execute on function public.reserve_stock_v2(jsonb) to service_role;

-- Make PostgREST see the new function right away.
notify pgrst, 'reload schema';
