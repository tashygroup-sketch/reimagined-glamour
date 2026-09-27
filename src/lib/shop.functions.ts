import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { imageSize } from "image-size";
import type { Database } from "@/integrations/supabase/types";

export const WHATSAPP_NUMBER = "218918640785";

// A product's own options, e.g. { name: "اللون", values: [{ label: "أحمر", image_url }] }.
// When a product has any, the customer must pick one value from each before ordering.
export type VariantValue = { label: string; image_url: string | null };
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
            const val = x as { label?: unknown; image_url?: unknown };
            return {
              label: typeof val?.label === "string" ? val.label.trim() : "",
              image_url:
                typeof val?.image_url === "string" && val.image_url.trim()
                  ? val.image_url.trim()
                  : null,
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
      values.push({ label, image_url: image });
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
};

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
  items: { name: string; qty: number; price: number; options?: OrderOption[] }[];
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

async function adminClient(phone: string) {
  const { isAdminPhone } = await import("@/lib/admin.server");
  if (!isAdminPhone(phone)) throw new Error("غير مصرح");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const MENU_COLUMN_SETS = [
  "id,name,description,price,image_url,image_ratio,extra_images,extra_image_ratios,category,sort_order,is_available,stock,variables",
  "id,name,description,price,image_url,image_ratio,extra_images,extra_image_ratios,category,sort_order,is_available,stock",
  "id,name,description,price,image_url,image_ratio,extra_images,extra_image_ratios,category,sort_order,is_available",
  "id,name,description,price,image_url,category,sort_order,is_available",
];

export const getMenu = createServerFn({ method: "GET" }).handler(async () => {
  const client = publicClient();
  for (const columns of MENU_COLUMN_SETS) {
    const { data, error } = await client
      .from("menu_items")
      .select(columns)
      .order("sort_order", { ascending: true });
    if (isMissingColumn(error)) continue;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as (Partial<MenuItem> & { variables?: unknown })[]).map(
      (row) => ({
        ...row,
        image_ratio: row.image_ratio ?? null,
        extra_images: row.extra_images ?? [],
        extra_image_ratios: row.extra_image_ratios ?? [],
        stock: row.stock ?? null,
        variables: normalizeVariables(row.variables),
      }),
    ) as MenuItem[];
  }
  throw new Error("تعذّر تحميل المنيو");
});

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      customer_name: string;
      phone: string;
      address: string;
      notes?: string;
      location_url?: string;
      items: { id?: string; name: string; qty: number; price: number; options?: OrderOption[] }[];
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

    // Every product that has variables must arrive with one valid choice per variable. The
    // site already enforces this before adding to the cart; checking again here means an old
    // cart (or a variable the owner edited meanwhile) can't slip an incomplete order through.
    // Runs before stock is deducted, so a refused order never touches stock.
    const productIds = [...new Set(data.items.map((i) => i.id).filter((id): id is string => !!id))];
    const cleanItems: {
      id?: string;
      name: string;
      qty: number;
      price: number;
      options?: OrderOption[];
    }[] = data.items.map((i) => ({
      ...(i.id ? { id: i.id } : {}),
      name: String(i.name ?? "").slice(0, 160),
      qty: Math.max(0, Math.floor(Number(i.qty) || 0)),
      price: Number(i.price) || 0,
    }));
    if (productIds.length > 0) {
      const { data: rows, error: varError } = await supabaseAdmin
        .from("menu_items")
        .select("id,name,variables")
        .in("id", productIds);
      if (varError && !isMissingColumn(varError)) throw new Error(varError.message);
      const byId = new Map((rows ?? []).map((r) => [r.id, r]));
      data.items.forEach((item, idx) => {
        const row = item.id ? byId.get(item.id) : undefined;
        if (!row) return;
        const variables = normalizeVariables(row.variables);
        if (variables.length === 0) return;
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
        cleanItems[idx]!.options = chosen;
      });
    }

    // Deduct stock first, atomically: if any item doesn't have enough, nothing is deducted
    // and the order is refused before WhatsApp ever opens.
    const stockItems = data.items
      .filter((i) => typeof i.id === "string" && i.id.length > 0)
      .map((i) => ({ id: i.id, qty: Math.max(0, Math.floor(Number(i.qty) || 0)) }));
    if (stockItems.length > 0) {
      const { error: stockError } = await supabaseAdmin.rpc("reserve_stock", {
        p_items: stockItems,
      });
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
      total: data.total ?? 0,
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
      };
    }) => {
      if (!input.item?.name?.trim()) throw new Error("اسم الصنف مطلوب");
      return input;
    },
  )
  .handler(async ({ data }) => {
    const db = await adminClient(data.phone);
    const payload = {
      name: data.item.name.trim().slice(0, 120),
      description: data.item.description?.trim().slice(0, 500) ?? null,
      price: Number(data.item.price) || 0,
      image_url: data.item.image_url?.trim() || null,
      image_ratio: data.item.image_ratio ?? null,
      extra_images: (data.item.extra_images ?? []).map((u) => u.trim()).filter(Boolean),
      extra_image_ratios: data.item.extra_image_ratios ?? [],
      category: data.item.category?.trim().slice(0, 60) || "مكياج",
      sort_order: Number(data.item.sort_order) || 0,
      is_available: data.item.is_available ?? true,
      stock:
        data.item.stock === null || data.item.stock === undefined
          ? null
          : Math.max(0, Math.floor(Number(data.item.stock) || 0)),
      variables: sanitizeVariables(data.item.variables),
    };
    const write = (row: Omit<Partial<typeof payload>, "name"> & { name: string }) =>
      data.item.id
        ? db.from("menu_items").update(row).eq("id", data.item.id)
        : db.from("menu_items").insert(row);

    let { error } = await write(payload);
    if (isMissingColumn(error)) {
      // A newer column hasn't been migrated onto the live database yet. Variables can't be
      // dropped silently (the owner would think they saved), so ask for the migration.
      if (payload.variables.length > 0) {
        throw new Error(
          "لحفظ المتغيرات شغّلي ملف تحديث قاعدة البيانات الجديد في Supabase (SQL Editor) أولاً",
        );
      }
      const { variables: _variables, ...withoutVariables } = payload;
      ({ error } = await write(withoutVariables));
      if (isMissingColumn(error)) {
        const {
          extra_images: _extraImages,
          extra_image_ratios: _ratios,
          image_ratio: _ratio,
          stock: _stock,
          ...rest
        } = withoutVariables;
        ({ error } = await write(rest));
      }
    }
    if (error) throw new Error(error.message);
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

export const uploadMenuImage = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { phone: string; filename: string; contentType: string; dataBase64: string }) => {
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
    const { error } = await db.storage
      .from("menu-photos")
      .upload(path, bytes, { contentType: data.contentType || "image/jpeg", upsert: false });
    if (error) throw new Error(error.message);
    const { data: pub } = db.storage.from("menu-photos").getPublicUrl(path);
    const ratio = getImageRatio(bytes);
    return { url: pub.publicUrl, ratio };
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
    hero_title: settings.data?.hero_title || DEFAULT_HERO.hero_title,
    hero_subtitle: settings.data?.hero_subtitle || DEFAULT_HERO.hero_subtitle,
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
      story_label: data.story_label.trim().slice(0, 60) || DEFAULT_STORY.story_label,
      story_title: data.story_title.trim().slice(0, 120) || DEFAULT_STORY.story_title,
      story_text: data.story_text.trim().slice(0, 800) || DEFAULT_STORY.story_text,
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
      hero_title: data.hero_title.trim().slice(0, 120) || DEFAULT_HERO.hero_title,
      hero_subtitle: data.hero_subtitle.trim().slice(0, 400) || DEFAULT_HERO.hero_subtitle,
    });
    if (isMissingColumn(error)) {
      throw new Error("يرجى تشغيل تحديث قاعدة البيانات أولاً (Supabase → SQL Editor)");
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });
