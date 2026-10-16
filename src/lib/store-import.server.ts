// Server-only. The shop's starting data, put into the new Cloudflare database the very first
// time the shop runs there (src/lib/store.server.ts calls it once, then never again).
//
// src/lib/seed/glamour-start.json was made from what was exported from Supabase (menu_items):
// the products with their prices, options, quantities and sale prices. Photo addresses already
// point to the shop's own /photos/… — the files themselves are still in the old Supabase
// storage and are copied over when it lets them out (see src/server.ts and copyOldPhotos).

type D1Like = {
  prepare(sql: string): {
    bind(...values: unknown[]): { run(): Promise<unknown> };
    run(): Promise<unknown>;
  };
};

// Where the photos were kept in Supabase: /photos/<name> is fetched from here the first time
// it's asked for, and kept in Cloudflare from then on.
export const OLD_PHOTO_BASE =
  "https://cmbblfgxrnxxwghbumho.supabase.co/storage/v1/object/public/menu-photos/";

type StartData = {
  products?: Record<string, unknown>[];
  categories?: Record<string, unknown>[];
  promotions?: Record<string, unknown>[];
  discounts?: Record<string, unknown>[];
  settings?: Record<string, unknown> | null;
};

const PRODUCT_COLUMNS = [
  "id",
  "name",
  "description",
  "price",
  "image_url",
  "image_ratio",
  "extra_images",
  "extra_image_ratios",
  "category",
  "sort_order",
  "is_available",
  "stock",
  "variables",
  "min_qty",
  "sale_price",
] as const;

// All rows of a list in one statement (one JSON value), so a big catalogue doesn't need
// hundreds of separate writes.
async function insertAll(
  db: D1Like,
  table: string,
  columns: readonly string[],
  rows: Record<string, unknown>[] | undefined,
  withDates = false,
) {
  if (!rows?.length) return;
  const cols = withDates ? [...columns, "created_at", "updated_at"] : [...columns];
  const picks = cols.map((c) =>
    c === "created_at" || c === "updated_at"
      ? `COALESCE(json_extract(value, '$.${c}'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
      : `json_extract(value, '$.${c}')`,
  );
  const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) SELECT ${picks.join(", ")} FROM json_each(?)`;
  // In pieces of at most ~300 KB, well under the database's 2 MB limit for one value.
  let piece: string[] = [];
  let size = 0;
  const flush = async () => {
    if (piece.length === 0) return;
    await db.prepare(sql).bind(`[${piece.join(",")}]`).run();
    piece = [];
    size = 0;
  };
  for (const row of rows) {
    const text = JSON.stringify(row);
    if (size + text.length > 300_000) await flush();
    piece.push(text);
    size += text.length + 1;
  }
  await flush();
}

const ORDER_COLUMNS = [
  "id",
  "customer_name",
  "phone",
  "address",
  "delivery_date",
  "notes",
  "location_url",
  "items",
  "total",
  "status",
  "created_at",
] as const;

type OldOrders = { orders?: Record<string, unknown>[]; discounts?: Record<string, unknown>[] };

// src/lib/seed/glamour-orders.json was made from Supabase's orders export. Orders keep their
// ids, status and the stock marks on their lines, so «تم التسليم» and its undo work on them
// exactly as before (nothing is taken twice). It holds customers' names and phones, so once
// the orders show in the control panel the file can be deleted from GitHub: the website
// still builds without it (that's why it's looked up with import.meta.glob).
// Returns false when the file isn't there, so nothing is marked as done.
const oldOrdersFile = import.meta.glob<OldOrders>("./seed/glamour-orders.json", {
  import: "default",
});

export async function importOldOrders(db: D1Like): Promise<boolean> {
  const load = Object.values(oldOrdersFile)[0];
  if (!load) return false;
  const data = await load();
  await insertAll(db, "orders", ORDER_COLUMNS, data.orders);
  await insertAll(
    db,
    "product_discounts",
    ["product_id", "code", "discount_price", "ends_at"],
    data.discounts,
    true,
  );
  return true;
}

export async function importStartingData(db: D1Like) {
  const mod = (await import("@/lib/seed/glamour-start.json")) as { default: StartData };
  const data = mod.default;
  await insertAll(db, "menu_items", PRODUCT_COLUMNS, data.products, true);
  await insertAll(db, "categories", ["name", "image_url", "sort_order"], data.categories);
  await insertAll(db, "promotions", ["id", "image_url", "ratio", "sort_order"], data.promotions);
  await insertAll(
    db,
    "product_discounts",
    ["product_id", "code", "discount_price", "ends_at"],
    data.discounts,
  );
  if (data.settings) {
    await insertAll(
      db,
      "site_settings",
      [
        "id",
        "story_label",
        "story_title",
        "story_text",
        "hero_image_url",
        "hero_title",
        "hero_subtitle",
      ],
      [{ ...data.settings, id: 1 }],
    );
  }
}
