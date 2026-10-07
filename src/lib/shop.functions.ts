import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { imageSize } from "image-size";
import type { Database } from "@/integrations/supabase/types";
import { hasValueStock, parseStock, totalFromValues } from "@/lib/stock";

export const WHATSAPP_NUMBER = "218918640785";

// A product's own options, e.g. { name: "اللون", values: [{ label: "أحمر", image_url, stock }] }.
// When a product has any, the customer must pick one value from each before ordering.
// `stock` = pieces of that value left; null = not counted (unlimited). See src/lib/stock.ts.
export type VariantValue = { label: string; image_url: string | null; stock: number | null };
export type ProductVariant = { name: string; values: VariantValue[] };
export type OrderOption = { name: string; value: string };

// Reads whatever is stored in menu_items.variables into a clean list (tolerates null, old
// shapes, empty names/values), so a bad row can never break the storefront.
export function normalizeVariables(raw: unknown): ProductVariant[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductVariant[] = [];
  for (const v of raw) {
    const name = typeof v?.name === "string" ? v.name.trim() : "";
    const values: VariantValue[] = Array.isArray(v?.values)
      ? v.values
          .map((x: unknown) => {
            const val = x as { label?: unknown; image_url?: unknown; stock?: unknown };
            return {
              label: typeof val?.label === "string" ? val.label.trim() : "",
              image_url:
                typeof val?.image_url === "string" && val.image_url.trim()
                  ? val.image_url.trim()
                  : null,
              stock: typeof val?.stock === "number" ? parseStock(val.stock) : null,
            };
          })
          .filter((x: VariantValue) => x.label)
      : [];
    if (name && values.length > 0) out.push({ name, values });
  }
  return out;
}

// Admin input → what gets stored. Unlike normalizeVariables, this reports mistakes instead of
// silently dropping them, so the owner knows why a variable didn't save.
function sanitizeVariables(input: unknown): ProductVariant[] {
  if (!Array.isArray(input)) return [];
  const out: ProductVariant[] = [];
  const names = new Set<string>();
  for (const v of input.slice(0, 8)) {
    const name = String(v?.name ?? "")
      .trim()
      .slice(0, 40);
    const labels = new Set<string>();
    const values: VariantValue[] = [];
    for (const val of Array.isArray(v?.values) ? v.values.slice(0, 40) : []) {
      const label = String(val?.label ?? "")
        .trim()
        .slice(0, 60);
      if (!label) continue;
      if (labels.has(label)) throw new Error(`القيمة "${label}" مكررة في "${name || "المتغير"}"`);
      labels.add(label);
      const image =
        typeof val?.image_url === "string" && val.image_url.trim()
          ? val.image_url.trim().slice(0, 500)
          : null;
      values.push({ label, image_url: image, stock: parseStock(val?.stock) });
    }
    if (!name && values.length === 0) continue;
    if (!name) throw new Error("اكتبي اسم المتغير (مثل: اللون)");
    if (values.length === 0) throw new Error(`أضيفي قيمة واحدة على الأقل للمتغير "${name}"`);
    if (names.has(name)) throw new Error(`اسم المتغير "${name}" مكرر`);
    names.add(name);
    out.push({ name, values });
  }
  return out;
}

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  image_ratio: number | null;
  extra_images: string[];
  extra_image_ratios: number[];
  category: string;
  sort_order: number;
  is_available: boolean;
  // null = stock not tracked (unlimited); 0 = sold out
  stock: number | null;
  variables: ProductVariant[];
  // "أقل كمية يمكن طلبها" — 1 means no minimum
  min_qty: number;
  // regular discount everyone sees (no code): `price` is shown struck through as the "was"
  // price and this is what's charged. null = no discount. Always below `price`.
  sale_price: number | null;
  // Only whether a discount code exists and when it ends. The code and the discounted price
  // never leave the server until a customer types the right code.
  discount: { ends_at: string | null } | null;
};

// The photo shown on a product's card. Normally the main photo; when the owner added photos
// only as extra photos or only on the values (colours), the first of those is used, so a
// product that has any photo at all never shows an empty box.
export function coverImage(item: {
  image_url: string | null;
  extra_images?: string[];
  variables?: { values: { image_url: string | null }[] }[];
}): string | null {
  if (item.image_url) return item.image_url;
  const extra = (item.extra_images ?? []).find(Boolean);
  if (extra) return extra;
  for (const v of item.variables ?? []) {
    const withPhoto = v.values.find((x) => x.image_url);
    if (withPhoto) return withPhoto.image_url;
  }
  return null;
}

// What a customer pays without a code: the sale price when there is one.
export function effectivePrice(item: { price: number; sale_price: number | null }) {
  return item.sale_price !== null && item.sale_price < Number(item.price)
    ? Number(item.sale_price)
    : Number(item.price);
}

// Admin input → stored sale price. Empty = no sale.
function parseSalePrice(raw: unknown, regular: number): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error("السعر بعد الخصم غير صحيح");
  if (n >= regular) throw new Error("السعر بعد الخصم يجب أن يكون أقل من السعر الأصلي");
  return Math.round(n * 100) / 100;
}

export type AdminDiscount = {
  product_id: string;
  code: string;
  discount_price: number;
  ends_at: string | null;
};

// Codes match regardless of case, spaces, or Arabic-vs-Latin digits ("sale٢٠" = "SALE20").
function normalizeCode(raw: string) {
  return String(raw ?? "")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, "")
    .toUpperCase();
}

function isActive(endsAt: string | null) {
  return endsAt === null || new Date(endsAt).getTime() > Date.now();
}

// PostgREST error codes for "that column doesn't exist (yet)". Lets the site keep working in
// the window between shipping this code and running the matching database migration.
function isMissingColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /does not exist|Could not find the/.test(error.message ?? "")
  );
}

// Measures a photo's real shape once, at upload time, using a library that's already
// battle-tested against real-world encoder output (my own first attempt at this used a
// hand-rolled parser that worked on my own test files but evidently missed something in
// what actual phone/Chrome-produced JPEGs look like). Also corrects for EXIF orientation:
// a photo tagged as rotated 90°/270° has its width and height swapped from how it's
// actually displayed, and that swap has to be applied here to get the true visual ratio.
function getImageRatio(bytes: Uint8Array): number | null {
  try {
    const result = imageSize(bytes);
    if (!result.width || !result.height) return null;
    const rotated =
      result.orientation != null && result.orientation >= 5 && result.orientation <= 8;
    const width = rotated ? result.height : result.width;
    const height = rotated ? result.width : result.height;
    return height / width;
  } catch {
    return null;
  }
}

export type OrderRow = {
  id: string;
  customer_name: string;
  phone: string;
  address: string | null;
  delivery_date: string | null;
  notes: string | null;
  location_url: string | null;
  items: {
    name: string;
    qty: number;
    price: number;
    options?: OrderOption[];
    discount_code?: string;
  }[];
  total: number;
  status: string;
  created_at: string;
};

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

// Newer stock function (supabase/migrations/20260928190000_value_stock.sql): same job as
// reserve_stock, plus each chosen value's own quantity. Typed as the old name because the
// generated database types only list that one; the arguments are the same shape.
const RESERVE_V2 = "reserve_stock_v2" as "reserve_stock";

async function adminClient(phone: string) {
  const { isAdminPhone } = await import("@/lib/admin.server");
  if (!isAdminPhone(phone)) throw new Error("غير مصرح");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const MENU_COLUMN_SETS = [
  "id,name,description,price,image_url,image_ratio,extra_images,extra_image_ratios,category,sort_order,is_available,stock,variables,min_qty,sale_price",
  "id,name,description,price,image_url,image_ratio,extra_images,extra_image_ratios,category,sort_order,is_available,stock,variables,min_qty",
  "id,name,description,price,image_url,image_ratio,extra_images,extra_image_ratios,category,sort_order,is_available,stock,variables",
  "id,name,description,price,image_url,image_ratio,extra_images,extra_image_ratios,category,sort_order,is_available,stock",
  "id,name,description,price,image_url,image_ratio,extra_images,extra_image_ratios,category,sort_order,is_available",
  "id,name,description,price,image_url,category,sort_order,is_available",
];

// Which products currently have a discount code, and until when — read with the server's
// admin key because the table isn't publicly readable. Any failure (table not created yet,
// key missing) just means "no discounts"; it must never take the menu down.
async function activeDiscountEnds(): Promise<Map<string, string | null>> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("product_discounts")
      .select("product_id,ends_at");
    if (error) return new Map();
    return new Map(
      (data ?? []).filter((d) => isActive(d.ends_at)).map((d) => [d.product_id, d.ends_at]),
    );
  } catch {
    return new Map();
  }
}

export const getMenu = createServerFn({ method: "GET" }).handler(async () => {
  const client = publicClient();
  const discountsPromise = activeDiscountEnds();
  for (const columns of MENU_COLUMN_SETS) {
    const { data, error } = await client
      .from("menu_items")
      .select(columns)
      .order("sort_order", { ascending: true });
    if (isMissingColumn(error)) continue;
    if (error) throw new Error(error.message);
    const discounts = await discountsPromise;
    return (
      (data ?? []) as unknown as (Partial<MenuItem> & { variables?: unknown; min_qty?: number })[]
    ).map((row) => ({
      ...row,
      image_ratio: row.image_ratio ?? null,
      extra_images: row.extra_images ?? [],
      extra_image_ratios: row.extra_image_ratios ?? [],
      stock: row.stock ?? null,
      variables: normalizeVariables(row.variables),
      min_qty: Math.max(1, Math.floor(Number(row.min_qty) || 1)),
      sale_price:
        row.sale_price !== null &&
        row.sale_price !== undefined &&
        Number(row.sale_price) >= 0 &&
        Number(row.sale_price) < Number(row.price)
          ? Number(row.sale_price)
          : null,
      discount: discounts.has(row.id!) ? { ends_at: discounts.get(row.id!) ?? null } : null,
    })) as MenuItem[];
  }
  throw new Error("تعذّر تحميل المنيو");
});

// Customer typed a code for one product. Returns the discounted price only on an exact match
// that hasn't expired.
export const checkDiscountCode = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; code: string }) => input)
  .handler(async ({ data }) => {
    const code = normalizeCode(data.code);
    if (!code || !data.id) return { ok: false as const, reason: "invalid" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("product_discounts")
      .select("code,discount_price,ends_at")
      .eq("product_id", data.id)
      .maybeSingle();
    if (!row || normalizeCode(row.code) !== code) {
      return { ok: false as const, reason: "invalid" as const };
    }
    if (!isActive(row.ends_at)) return { ok: false as const, reason: "expired" as const };
    return { ok: true as const, price: Number(row.discount_price), ends_at: row.ends_at };
  });

export const getDiscountsAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string }) => input)
  .handler(async ({ data }) => {
    const db = await adminClient(data.phone);
    const { data: rows, error } = await db
      .from("product_discounts")
      .select("product_id,code,discount_price,ends_at");
    if (isMissingColumn(error)) return [] as AdminDiscount[];
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({ ...r, discount_price: Number(r.discount_price) }));
  });

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      customer_name: string;
      phone: string;
      address: string;
      notes?: string;
      location_url?: string;
      items: {
        id?: string;
        name: string;
        qty: number;
        price: number;
        options?: OrderOption[];
        discount_code?: string;
      }[];
      total: number;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { isAdminPhone } = await import("@/lib/admin.server");
    if (isAdminPhone(data.phone)) {
      // Admin trigger code: don't log this as a real customer order, and skip every
      // validation rule below that a real order would need to satisfy.
      return { id: "admin", isAdmin: true as const };
    }

    const name = data.customer_name?.trim();
    const phone = data.phone?.trim();
    const address = data.address?.trim();
    if (!name) throw new Error("الاسم مطلوب");
    if (!phone || !/^(091|092|093|094)\d{7}$/.test(phone)) {
      throw new Error("رقم الهاتف يجب أن يتكون من 10 أرقام ويبدأ بـ 091 أو 092 أو 093 أو 094");
    }
    if (!address) throw new Error("العنوان مطلوب");
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error("اختر صنفًا واحدًا على الأقل من المنيو");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Everything the customer's browser sent is re-checked against the database here, before
    // stock is touched: chosen options, minimum quantity, discount codes, and the price of
    // every line. The WhatsApp message is written from the same cart, so a refused order
    // means a wrong price can never reach the owner.
    const productIds = [...new Set(data.items.map((i) => i.id).filter((id): id is string => !!id))];
    type CleanItem = {
      id?: string;
      name: string;
      qty: number;
      price: number;
      options?: OrderOption[];
      discount_code?: string;
    };
    const cleanItems: CleanItem[] = data.items.map((i) => ({
      ...(i.id ? { id: i.id } : {}),
      name: String(i.name ?? "").slice(0, 160),
      qty: Math.max(0, Math.floor(Number(i.qty) || 0)),
      price: Number(i.price) || 0,
    }));
    if (cleanItems.some((i) => i.qty < 1)) throw new Error("الكمية غير صحيحة، يرجى تعديل السلة");

    if (productIds.length > 0) {
      type ProductRow = {
        id: string;
        name: string;
        price: number;
        variables?: unknown;
        min_qty?: number;
        sale_price?: number | null;
      };
      let rows: ProductRow[] = [];
      for (const cols of [
        "id,name,price,sale_price,variables,min_qty",
        "id,name,price,variables,min_qty",
        "id,name,price,variables",
        "id,name,price",
      ]) {
        const res = await supabaseAdmin.from("menu_items").select(cols).in("id", productIds);
        if (isMissingColumn(res.error)) continue;
        if (res.error) throw new Error(res.error.message);
        rows = (res.data ?? []) as unknown as ProductRow[];
        break;
      }
      const byId = new Map(rows.map((r) => [r.id, r]));

      const codedIds = [
        ...new Set(data.items.filter((i) => i.id && i.discount_code?.trim()).map((i) => i.id!)),
      ];
      const discounts = new Map<
        string,
        { code: string; discount_price: number; ends_at: string | null }
      >();
      if (codedIds.length > 0) {
        const { data: drows } = await supabaseAdmin
          .from("product_discounts")
          .select("product_id,code,discount_price,ends_at")
          .in("product_id", codedIds);
        for (const d of drows ?? [])
          discounts.set(d.product_id, { ...d, discount_price: Number(d.discount_price) });
      }

      const qtyByProduct = new Map<string, number>();
      data.items.forEach((item, idx) => {
        const row = item.id ? byId.get(item.id) : undefined;
        if (!row) return;
        const clean = cleanItems[idx]!;
        qtyByProduct.set(row.id, (qtyByProduct.get(row.id) ?? 0) + clean.qty);

        // options
        const variables = normalizeVariables(row.variables);
        if (variables.length > 0) {
          const chosen: OrderOption[] = [];
          for (const v of variables) {
            const pick = item.options?.find((o) => o.name === v.name);
            if (!pick || !v.values.some((val) => val.label === pick.value)) {
              throw new Error(
                pick
                  ? `الخيار "${pick.value}" لم يعد متوفرًا في "${row.name}"، احذفيه من السلة وأضيفيه من جديد`
                  : `اختاري ${v.name} للمنتج "${row.name}"`,
              );
            }
            chosen.push({ name: v.name, value: pick.value });
          }
          clean.options = chosen;
        }

        // price: the discount price only with a valid, unexpired code; otherwise the regular one
        let price = effectivePrice({
          price: Number(row.price),
          sale_price:
            row.sale_price === null || row.sale_price === undefined ? null : Number(row.sale_price),
        });
        const typed = item.discount_code?.trim();
        if (typed) {
          const d = discounts.get(row.id);
          if (!d || normalizeCode(d.code) !== normalizeCode(typed)) {
            throw new Error(
              `كود الخصم على "${row.name}" غير صحيح، احذفيه من السلة وأضيفيه من جديد`,
            );
          }
          if (!isActive(d.ends_at)) {
            throw new Error(`انتهى الخصم على "${row.name}"، احذفيه من السلة وأضيفيه من جديد`);
          }
          price = d.discount_price;
          clean.discount_code = d.code;
        }
        if (Math.abs(price - clean.price) > 0.005) {
          throw new Error(`تغيّر سعر "${row.name}"، احذفيه من السلة وأضيفيه من جديد`);
        }
        clean.price = price;
      });

      // minimum quantity counts all option lines of one product together
      for (const [id, qty] of qtyByProduct) {
        const row = byId.get(id)!;
        const min = Math.max(1, Math.floor(Number(row.min_qty) || 1));
        if (qty < min) {
          throw new Error(`أقل كمية يمكن طلبها من "${row.name}" هي ${min}`);
        }
      }
    }

    // Deduct stock first, atomically: if any item doesn't have enough, nothing is deducted
    // and the order is refused before WhatsApp ever opens. The checked options go along so
    // each chosen value's own quantity goes down too.
    const stockItems = cleanItems
      .filter((i) => typeof i.id === "string" && i.id.length > 0)
      .map((i) => ({ id: i.id!, qty: i.qty, options: i.options ?? [] }));
    if (stockItems.length > 0) {
      let { error: stockError } = await supabaseAdmin.rpc(RESERVE_V2, { p_items: stockItems });
      if (stockError?.code === "PGRST202") {
        // Newer function not installed yet: the older one still handles product totals.
        ({ error: stockError } = await supabaseAdmin.rpc("reserve_stock", {
          p_items: stockItems,
        }));
      }
      if (stockError) {
        const outOfStock = /OUT_OF_STOCK:(.+)$/.exec(stockError.message);
        if (outOfStock) {
          throw new Error(
            `الكمية المتوفرة من "${outOfStock[1]!.trim()}" لا تكفي، يرجى تعديل السلة`,
          );
        }
        if (stockError.message.includes("ITEM_NOT_FOUND")) {
          throw new Error("أحد الأصناف في السلة لم يعد متوفرًا، يرجى تعديل السلة");
        }
        // PGRST202 = function not found: the stock migration hasn't been run yet.
        // Don't block real orders over it — just skip stock tracking until it exists.
        if (stockError.code !== "PGRST202") throw new Error(stockError.message);
      }
    }

    const payload: Database["public"]["Tables"]["orders"]["Insert"] = {
      customer_name: name.slice(0, 120),
      phone: phone.slice(0, 40),
      address: address.slice(0, 300),
      notes: data.notes?.trim().slice(0, 600) ?? null,
      location_url: data.location_url?.trim().slice(0, 300) ?? null,
      items: cleanItems,
      // recomputed from the checked prices, not taken from the browser
      total: Math.round(cleanItems.reduce((sum, i) => sum + i.price * i.qty, 0) * 100) / 100,
    };
    let result = await supabaseAdmin.from("orders").insert(payload).select("id").single();
    if (result.error?.code === "PGRST204") {
      // The location_url column hasn't been migrated onto the live database yet —
      // don't let a customer's order fail just because of that; save without it.
      const { location_url: _locationUrl, ...withoutLocation } = payload;
      result = await supabaseAdmin.from("orders").insert(withoutLocation).select("id").single();
    }
    if (result.error) throw new Error(result.error.message);
    return { id: result.data.id as string, isAdmin: false as const };
  });

export const listOrders = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string }) => input)
  .handler(async ({ data }) => {
    const db = await adminClient(data.phone);
    const { data: rows, error } = await db
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as OrderRow[];
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; id: string; status: string }) => input)
  .handler(async ({ data }) => {
    const db = await adminClient(data.phone);
    const { error } = await db.from("orders").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveMenuItem = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      phone: string;
      item: {
        id?: string;
        name: string;
        description?: string;
        price: number;
        image_url?: string;
        image_ratio?: number | null;
        extra_images?: string[];
        extra_image_ratios?: number[];
        category: string;
        sort_order?: number;
        is_available?: boolean;
        stock?: number | null;
        variables?: ProductVariant[];
        min_qty?: number;
        sale_price?: number | null;
        // null/empty code = remove the product's discount
        discount?: { code: string; discount_price: number; ends_at: string | null } | null;
      };
    }) => {
      if (!input.item?.name?.trim()) throw new Error("اسم الصنف مطلوب");
      return input;
    },
  )
  .handler(async ({ data }) => {
    const db = await adminClient(data.phone);
    const variables = sanitizeVariables(data.item.variables);
    const valueStock = hasValueStock(variables);
    if (valueStock) {
      // Quantities per value are only safe once the database can deduct them on each order.
      // Calling the function with an empty order changes nothing; it only proves it exists.
      const { error: fnError } = await db.rpc(RESERVE_V2, { p_items: [] });
      if (fnError?.code === "PGRST202") {
        throw new Error(
          "لحفظ كمية لكل قيمة شغّلي ملف تحديث قاعدة البيانات الجديد (value_stock) في Supabase أولاً",
        );
      }
      if (fnError) throw new Error(fnError.message);
    }
    // A product saved with extra photos but no main photo gets its first extra photo as the
    // main one, so its card is never empty.
    let mainImage = data.item.image_url?.trim() || null;
    let mainRatio = data.item.image_ratio ?? null;
    let extraImages = (data.item.extra_images ?? []).map((u) => u.trim());
    let extraRatios = data.item.extra_image_ratios ?? [];
    if (!mainImage) {
      const first = extraImages.findIndex(Boolean);
      if (first !== -1) {
        mainImage = extraImages[first]!;
        mainRatio = extraRatios[first] ?? null;
        extraImages = extraImages.filter((_, i) => i !== first);
        extraRatios = extraRatios.filter((_, i) => i !== first);
      }
    }
    // drop empty addresses, keeping each remaining photo next to its own shape
    extraRatios = extraRatios.filter((_, i) => Boolean(extraImages[i]));
    extraImages = extraImages.filter(Boolean);
    const payload = {
      name: data.item.name.trim().slice(0, 120),
      description: data.item.description?.trim().slice(0, 500) ?? null,
      price: Number(data.item.price) || 0,
      image_url: mainImage,
      image_ratio: mainRatio,
      extra_images: extraImages,
      extra_image_ratios: extraRatios,
      category: data.item.category?.trim().slice(0, 60) || "مكياج",
      sort_order: Number(data.item.sort_order) || 0,
      is_available: data.item.is_available ?? true,
      // With quantities per value, the total is calculated from them (never typed by hand).
      stock: valueStock
        ? totalFromValues(variables)
        : data.item.stock === null || data.item.stock === undefined
          ? null
          : Math.max(0, Math.floor(Number(data.item.stock) || 0)),
      variables,
      min_qty: Math.min(999, Math.max(1, Math.floor(Number(data.item.min_qty) || 1))),
      sale_price: parseSalePrice(data.item.sale_price, Number(data.item.price) || 0),
    };

    // Validate the discount before writing anything, so a bad discount doesn't leave the
    // product half-saved.
    const code = data.item.discount?.code?.trim().slice(0, 40) ?? "";
    let discount: { code: string; discount_price: number; ends_at: string | null } | null = null;
    if (code) {
      const discountPrice = Number(data.item.discount?.discount_price);
      if (!Number.isFinite(discountPrice) || discountPrice < 0) {
        throw new Error("اكتبي سعر الخصم");
      }
      if (discountPrice >= effectivePrice(payload)) {
        throw new Error("السعر مع الكود يجب أن يكون أقل من سعر المنتج الحالي");
      }
      const endsAt = data.item.discount?.ends_at ?? null;
      if (endsAt !== null && Number.isNaN(new Date(endsAt).getTime())) {
        throw new Error("وقت انتهاء الخصم غير صحيح");
      }
      discount = {
        code,
        discount_price: Math.round(discountPrice * 100) / 100,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      };
    }

    type Row = Omit<Partial<typeof payload>, "name"> & { name: string };
    const write = async (row: Row) => {
      if (data.item.id) {
        const { error } = await db.from("menu_items").update(row).eq("id", data.item.id);
        return { error, id: data.item.id };
      }
      const { data: inserted, error } = await db
        .from("menu_items")
        .insert(row)
        .select("id")
        .single();
      return { error, id: inserted?.id as string | undefined };
    };

    // Newer columns may not be migrated onto the live database yet. Retry without them one
    // generation at a time, but never silently drop a setting the owner actually used.
    const needMigration = () =>
      new Error(
        "شغّلي ملفات تحديث قاعدة البيانات الجديدة في Supabase (SQL Editor) ثم احفظي مرة أخرى",
      );
    let result = await write(payload);
    if (isMissingColumn(result.error)) {
      if (payload.sale_price !== null) throw needMigration();
      const { sale_price: _sale, ...noSale } = payload;
      result = await write(noSale);
      if (isMissingColumn(result.error)) {
        if (payload.variables.length > 0 || payload.min_qty > 1) throw needMigration();
        const { variables: _variables, min_qty: _minQty, ...older } = noSale;
        result = await write(older);
        if (isMissingColumn(result.error)) {
          const {
            extra_images: _extraImages,
            extra_image_ratios: _ratios,
            image_ratio: _ratio,
            stock: _stock,
            ...rest
          } = older;
          result = await write(rest);
        }
      }
    }
    if (result.error) throw new Error(result.error.message);

    const productId = result.id;
    if (productId) {
      const { error: discountError } = discount
        ? await db
            .from("product_discounts")
            .upsert(
              { product_id: productId, ...discount, updated_at: new Date().toISOString() },
              { onConflict: "product_id" },
            )
        : await db.from("product_discounts").delete().eq("product_id", productId);
      if (discountError) {
        if (!isMissingColumn(discountError)) throw new Error(discountError.message);
        if (discount) {
          throw new Error(
            "تم حفظ المنتج، لكن لحفظ كود الخصم شغّلي ملف تحديث قاعدة البيانات الجديد في Supabase أولاً",
          );
        }
      }
    }
    return { ok: true };
  });

export const deleteMenuItem = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; id: string }) => input)
  .handler(async ({ data }) => {
    const db = await adminClient(data.phone);
    const { error } = await db.from("menu_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Uploaded photos never change (each gets a new random name), so phones may keep them for a
// year: a returning customer sees the photos instantly, without downloading them again.
const PHOTO_CACHE_SECONDS = "31536000";

// Address prefix of the shop's own uploaded photos. Light copies live in its thumbs/ folder,
// under the same file name (see src/lib/photos.ts).
function photoPrefix() {
  return `${process.env["SUPABASE_URL"]!.replace(/\/+$/, "")}/storage/v1/object/public/menu-photos/`;
}

// File name of one of the shop's own photos, or null for any other address.
function ownPhotoName(url: string): string | null {
  const prefix = photoPrefix();
  if (typeof url !== "string" || !url.startsWith(prefix)) return null;
  const name = url.slice(prefix.length);
  return /^[A-Za-z0-9._-]+$/.test(name) ? name : null;
}

export const uploadMenuImage = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      phone: string;
      filename: string;
      contentType: string;
      dataBase64: string;
      // the light copy for cards, made by the browser from the same crop
      thumbBase64?: string;
    }) => {
      if (!input.dataBase64?.trim()) throw new Error("لا توجد صورة");
      return input;
    },
  )
  .handler(async ({ data }) => {
    const db = await adminClient(data.phone);
    const bytes = Buffer.from(data.dataBase64, "base64");
    if (bytes.byteLength > 6 * 1024 * 1024)
      throw new Error("حجم الصورة كبير جدًا (الحد الأقصى 6 ميجابايت)");
    const ext =
      (data.filename.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from("menu-photos").upload(path, bytes, {
      contentType: data.contentType || "image/jpeg",
      upsert: false,
      cacheControl: PHOTO_CACHE_SECONDS,
    });
    if (error) throw new Error(error.message);
    if (data.thumbBase64?.trim()) {
      // Best effort: without it the cards simply show the full photo, and the control panel
      // creates the missing light copy later.
      const thumb = Buffer.from(data.thumbBase64, "base64");
      if (thumb.byteLength <= 400 * 1024) {
        await db.storage
          .from("menu-photos")
          .upload(`thumbs/${path}`, thumb, {
            contentType: "image/jpeg",
            upsert: true,
            cacheControl: PHOTO_CACHE_SECONDS,
          })
          .catch(() => null);
      }
    }
    const { data: pub } = db.storage.from("menu-photos").getPublicUrl(path);
    const ratio = getImageRatio(bytes);
    return { url: pub.publicUrl, ratio };
  });

// Stores the light copy of a photo that was uploaded before light copies existed. The copy
// is made in the owner's browser (src/lib/thumbs.ts); this only saves it next to the photo.
export const saveThumbnail = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; url: string; dataBase64: string }) => {
    if (!input.dataBase64?.trim()) throw new Error("لا توجد صورة");
    return input;
  })
  .handler(async ({ data }) => {
    const db = await adminClient(data.phone);
    const name = ownPhotoName(data.url);
    if (!name) throw new Error("ليست من صور المتجر");
    const bytes = Buffer.from(data.dataBase64, "base64");
    if (bytes.byteLength > 400 * 1024) throw new Error("النسخة الخفيفة أكبر من المتوقع");
    const { error } = await db.storage.from("menu-photos").upload(`thumbs/${name}`, bytes, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: PHOTO_CACHE_SECONDS,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Hands one of the shop's own photos to the owner's browser, for when the browser isn't
// allowed to read it directly from storage. Only the shop's photos, only for the admin.
export const fetchPhotoForThumb = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; url: string }) => input)
  .handler(async ({ data }) => {
    await adminClient(data.phone);
    if (!ownPhotoName(data.url)) throw new Error("ليست من صور المتجر");
    const res = await fetch(data.url);
    if (!res.ok) return { ok: false as const, status: res.status };
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > 8 * 1024 * 1024) return { ok: false as const, status: 413 };
    return {
      ok: true as const,
      base64: bytes.toString("base64"),
      contentType: res.headers.get("content-type") || "image/jpeg",
    };
  });

const DEFAULT_STORY = {
  story_label: "قصتنا",
  story_title: "لمسة Glamour في كل تفصيلة",
  story_text:
    "من شغفنا بالجمال إلى وجهتكِ المفضلة لمستحضرات التجميل، نختار لكِ أفضل منتجات المكياج والعناية بالبشرة لتشعري بالثقة والتألق كل يوم.",
};

export type Promotion = { id: string; image_url: string; ratio: number | null; sort_order: number };

export const DEFAULT_HERO = {
  hero_title: "جمالك يبدأ من هنا",
  hero_subtitle: "مكياج، عناية بالبشرة وعطور مختارة بعناية — كل ما تحتاجينه لتتألقي كل يوم.",
};

type SettingsRow = {
  story_label?: string | null;
  story_title?: string | null;
  story_text?: string | null;
  hero_image_url?: string | null;
  hero_title?: string | null;
  hero_subtitle?: string | null;
};

// Newest columns first; each step back drops the columns added by the most recent migration,
// so the home page keeps loading even before a new migration has been run.
const SETTINGS_COLUMN_SETS = [
  "story_label,story_title,story_text,hero_image_url,hero_title,hero_subtitle",
  "story_label,story_title,story_text,hero_image_url",
  "story_label,story_title,story_text",
];

async function loadSettings(client: ReturnType<typeof publicClient>) {
  for (const columns of SETTINGS_COLUMN_SETS) {
    const res = await client.from("site_settings").select(columns).eq("id", 1).maybeSingle();
    if (isMissingColumn(res.error)) continue;
    return { error: res.error, data: res.data as unknown as SettingsRow | null };
  }
  return { error: null, data: null };
}

export const getStorySection = createServerFn({ method: "GET" }).handler(async () => {
  const client = publicClient();
  const [settings, promos] = await Promise.all([
    loadSettings(client),
    client
      .from("promotions")
      .select("id,image_url,ratio,sort_order")
      .order("sort_order", { ascending: true }),
  ]);
  if (settings.error) throw new Error(settings.error.message);
  if (promos.error) throw new Error(promos.error.message);
  return {
    story_label: settings.data?.story_label ?? DEFAULT_STORY.story_label,
    story_title: settings.data?.story_title ?? DEFAULT_STORY.story_title,
    story_text: settings.data?.story_text ?? DEFAULT_STORY.story_text,
    hero_image_url: settings.data?.hero_image_url ?? null,
    // null = never edited (built-in wording); "" = the owner cleared it, so nothing is shown
    hero_title: settings.data?.hero_title ?? DEFAULT_HERO.hero_title,
    hero_subtitle: settings.data?.hero_subtitle ?? DEFAULT_HERO.hero_subtitle,
    images: (promos.data ?? []) as Promotion[],
  };
});

export const saveStorySettings = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { phone: string; story_label: string; story_title: string; story_text: string }) =>
      input,
  )
  .handler(async ({ data }) => {
    const db = await adminClient(data.phone);
    const { error } = await db.from("site_settings").upsert({
      id: 1,
      // Saved exactly as typed: an emptied field stays empty and is hidden on the site.
      story_label: (data.story_label ?? "").trim().slice(0, 60),
      story_title: (data.story_title ?? "").trim().slice(0, 120),
      story_text: (data.story_text ?? "").trim().slice(0, 800),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addPromotion = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; image_url: string; ratio?: number | null }) => {
    if (!input.image_url?.trim()) throw new Error("رابط الصورة مطلوب");
    return input;
  })
  .handler(async ({ data }) => {
    const db = await adminClient(data.phone);
    const { data: last, error: lastError } = await db
      .from("promotions")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    if (lastError) throw new Error(lastError.message);
    const nextOrder = (last?.[0]?.sort_order ?? -1) + 1;
    const payload = {
      image_url: data.image_url.trim(),
      ratio: data.ratio ?? null,
      sort_order: nextOrder,
    };
    let { error } = await db.from("promotions").insert(payload);
    if (error?.code === "PGRST204") {
      // The ratio column hasn't been migrated onto the live database yet.
      const { ratio: _ratio, ...withoutRatio } = payload;
      ({ error } = await db.from("promotions").insert(withoutRatio));
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePromotion = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; id: string }) => input)
  .handler(async ({ data }) => {
    const db = await adminClient(data.phone);
    const { error } = await db.from("promotions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveHeroImage = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; hero_image_url: string | null }) => input)
  .handler(async ({ data }) => {
    const db = await adminClient(data.phone);
    const { error } = await db
      .from("site_settings")
      .upsert({ id: 1, hero_image_url: data.hero_image_url?.trim() || null });
    if (isMissingColumn(error)) {
      throw new Error("يرجى تشغيل تحديث قاعدة البيانات أولاً (Supabase → SQL Editor)");
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type CategoryInfo = { name: string; image_url: string | null; sort_order: number };

export const getCategories = createServerFn({ method: "GET" }).handler(async () => {
  const client = publicClient();
  const { data, error } = await client
    .from("categories")
    .select("name,image_url,sort_order")
    .order("sort_order", { ascending: true });
  // Table not created yet (migration not run): the site still works, just without photos.
  if (isMissingColumn(error)) return [] as CategoryInfo[];
  if (error) throw new Error(error.message);
  return (data ?? []) as CategoryInfo[];
});

export const saveCategoryImage = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; name: string; image_url: string | null }) => {
    if (!input.name?.trim()) throw new Error("اسم التصنيف مطلوب");
    return input;
  })
  .handler(async ({ data }) => {
    const db = await adminClient(data.phone);
    const { error } = await db
      .from("categories")
      .upsert(
        { name: data.name.trim().slice(0, 60), image_url: data.image_url?.trim() || null },
        { onConflict: "name" },
      );
    if (isMissingColumn(error)) {
      throw new Error("شغّلي ملف تحديث قاعدة البيانات الجديد في Supabase (SQL Editor) أولاً");
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveHeroText = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; hero_title: string; hero_subtitle: string }) => input)
  .handler(async ({ data }) => {
    const db = await adminClient(data.phone);
    const { error } = await db.from("site_settings").upsert({
      id: 1,
      // Saved exactly as typed: an emptied line stays empty and is hidden on the site.
      hero_title: (data.hero_title ?? "").trim().slice(0, 120),
      hero_subtitle: (data.hero_subtitle ?? "").trim().slice(0, 400),
    });
    if (isMissingColumn(error)) {
      throw new Error("يرجى تشغيل تحديث قاعدة البيانات أولاً (Supabase → SQL Editor)");
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });
