// Server-only. Import it only with `await import("@/lib/store.server")` inside a server
// function or the server entry, never from a page or component.
//
// ---------- the shop's own storage on Cloudflare (no Supabase) ----------
//
// Everything the shop keeps lives in the same Cloudflare account as the website:
//   • DB     — a D1 database (products, categories, ads, discount codes, orders, settings)
//   • PHOTOS — a Workers KV namespace (every photo and its light copy, by file name)
// Both are free and need no card. They're connected to the website in wrangler.json.
//
// The rest of the server code was written for Supabase, so `getStore()` answers the same way
// Supabase's client did (`from("menu_items").select(...).eq(...)`, `.rpc("reserve_stock_v2")`,
// `.storage.from("menu-photos").upload(...)`), backed by D1 and KV instead. Only the small part
// of that client the shop uses is here.

// ---------- the Cloudflare pieces this file uses ----------

type D1Meta = { changes?: number };
type D1Result<T> = { results?: T[]; success: boolean; meta?: D1Meta };
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result<unknown>[]>;
}
type PhotoMeta = { contentType?: string };
interface KVNamespace {
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  getWithMetadata<M>(
    key: string,
    options: { type: "stream" },
  ): Promise<{ value: ReadableStream | null; metadata: M | null }>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: { metadata?: unknown },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}
export type ShopEnv = { DB: D1Database; PHOTOS: KVNamespace };

function isShopEnv(x: unknown): x is ShopEnv {
  const env = x as Partial<ShopEnv> | null;
  return !!env && typeof env === "object" && !!env.DB && !!env.PHOTOS;
}

// The bindings are the same for every request a Worker serves, so the first request that
// brings them is remembered (src/server.ts hands them over).
let knownEnv: ShopEnv | null = null;

export function rememberEnv(candidate: unknown) {
  if (!knownEnv && isShopEnv(candidate)) knownEnv = candidate;
}

export async function shopEnv(): Promise<ShopEnv> {
  if (knownEnv) return knownEnv;
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest() as Request & { runtime?: { cloudflare?: { env?: unknown } } };
    rememberEnv(req?.runtime?.cloudflare?.env);
  } catch {
    // not inside a request
  }
  if (knownEnv) return knownEnv;
  try {
    const name = "cloudflare:workers";
    const mod = (await import(/* @vite-ignore */ name)) as { env?: unknown };
    rememberEnv(mod.env);
  } catch {
    // not running on Cloudflare
  }
  if (knownEnv) return knownEnv;
  throw new Error(
    "قاعدة بيانات المتجر غير مربوطة بالموقع بعد — راجعي ملف wrangler.json (DB و PHOTOS)",
  );
}

// ---------- the tables ----------
//
// Created automatically the first time the shop runs (no SQL to run by hand). Lists and
// option sets are kept as JSON text, true/false as 1/0 — the reading code turns them back.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL DEFAULT 0,
    image_url TEXT,
    image_ratio REAL,
    extra_images TEXT NOT NULL DEFAULT '[]',
    extra_image_ratios TEXT NOT NULL DEFAULT '[]',
    category TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_available INTEGER NOT NULL DEFAULT 1,
    stock INTEGER,
    variables TEXT NOT NULL DEFAULT '[]',
    min_qty INTEGER NOT NULL DEFAULT 1,
    sale_price REAL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS menu_items_order ON menu_items (sort_order, id)`,
  `CREATE TABLE IF NOT EXISTS categories (
    name TEXT PRIMARY KEY,
    image_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS promotions (
    id TEXT PRIMARY KEY,
    image_url TEXT NOT NULL,
    ratio REAL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS product_discounts (
    product_id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    discount_price REAL NOT NULL,
    ends_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    delivery_date TEXT,
    notes TEXT,
    location_url TEXT,
    items TEXT NOT NULL DEFAULT '[]',
    total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'جديد',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS orders_created ON orders (created_at)`,
  `CREATE TABLE IF NOT EXISTS site_settings (
    id INTEGER PRIMARY KEY,
    story_label TEXT,
    story_title TEXT,
    story_text TEXT,
    hero_image_url TEXT,
    hero_title TEXT,
    hero_subtitle TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  // what has been done once: the first import of the products, …
  `CREATE TABLE IF NOT EXISTS shop_meta (key TEXT PRIMARY KEY, value TEXT)`,
  // photos already copied over from the old Supabase storage
  // state: 'ok' = in KV now, 'missing' = Supabase didn't have it (to be uploaded again)
  `CREATE TABLE IF NOT EXISTS moved_photos (name TEXT PRIMARY KEY, state TEXT NOT NULL DEFAULT 'ok')`,
  // used by the stock deduction to cancel everything when one product changed meanwhile
  `CREATE TABLE IF NOT EXISTS stock_guard (n INTEGER CHECK (n = 0))`,
];

// Per table: which columns hold JSON, which hold true/false, and the key used by upsert.
const JSON_COLUMNS: Record<string, string[]> = {
  menu_items: ["extra_images", "extra_image_ratios", "variables"],
  orders: ["items"],
};
const BOOL_COLUMNS: Record<string, string[]> = { menu_items: ["is_available"] };
const PRIMARY_KEY: Record<string, string> = {
  menu_items: "id",
  categories: "name",
  promotions: "id",
  product_discounts: "product_id",
  orders: "id",
  site_settings: "id",
};
// tables whose updated_at is set on every update
const TOUCHED_TABLES = new Set(["menu_items", "site_settings", "product_discounts"]);
// tables whose new rows get a random id (uuid) when none is given
const UUID_TABLES = new Set(["menu_items", "promotions", "orders"]);

let schemaReady = false;

async function ensureSchema(db: D1Database) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
  const flags = await db
    .prepare("SELECT key FROM shop_meta WHERE key IN ('products_imported', 'orders_imported')")
    .all<{ key: string }>();
  const done = new Set((flags.results ?? []).map((r) => r.key));
  const markDone = (key: string) =>
    db
      .prepare(
        "INSERT OR REPLACE INTO shop_meta (key, value) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
      )
      .bind(key)
      .run();
  if (!done.has("products_imported")) {
    const { importStartingData } = await import("@/lib/store-import.server");
    await importStartingData(db);
    await markDone("products_imported");
  }
  // The orders and discount codes from Supabase came in a second step, after the shop was
  // already running here: added once, next to anything placed here since (never replacing it).
  if (!done.has("orders_imported")) {
    const { importOldOrders } = await import("@/lib/store-import.server");
    if (await importOldOrders(db)) await markDone("orders_imported");
  }
  schemaReady = true;
}

// ---------- reading and writing rows the way the Supabase client did ----------

type StoreError = { code?: string; message: string };
type StoreResult<T> = { data: T; error: null } | { data: null; error: StoreError };

const SAFE_NAME = /^[a-z_][a-z0-9_]*$/;
function column(name: string): string {
  if (!SAFE_NAME.test(name)) throw new Error(`bad column ${name}`);
  return name;
}
function columnList(cols: string): string {
  const trimmed = cols.replace(/\s+/g, "");
  if (trimmed === "*" || trimmed === "") return "*";
  return trimmed.split(",").map(column).join(", ");
}

function toDb(table: string, col: string, value: unknown): unknown {
  if (value === undefined) return null;
  if (JSON_COLUMNS[table]?.includes(col)) return JSON.stringify(value ?? []);
  if (BOOL_COLUMNS[table]?.includes(col)) return value ? 1 : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
}

function fromDb(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const col of JSON_COLUMNS[table] ?? []) {
    if (typeof out[col] === "string") {
      try {
        out[col] = JSON.parse(out[col] as string);
      } catch {
        out[col] = [];
      }
    }
  }
  for (const col of BOOL_COLUMNS[table] ?? []) {
    if (col in out) out[col] = out[col] === 1 || out[col] === true || out[col] === "1";
  }
  return out;
}

type Filter = { sql: string; values: unknown[] };

class Query<T = Record<string, unknown>> implements PromiseLike<StoreResult<T>> {
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private cols = "*";
  private returning: string | null = null;
  private filters: Filter[] = [];
  private orderBy: string[] = [];
  private limitN: number | null = null;
  private offsetN = 0;
  private one: "single" | "maybe" | null = null;
  private rows: Record<string, unknown>[] = [];
  private changes: Record<string, unknown> = {};
  private conflict: string | null = null;

  constructor(
    private db: D1Database,
    private table: string,
  ) {
    column(table);
  }

  select(cols = "*") {
    if (this.mode === "select") this.cols = cols;
    else this.returning = cols;
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push({ sql: `${column(col)} = ?`, values: [toDb(this.table, col, value)] });
    return this;
  }
  neq(col: string, value: unknown) {
    this.filters.push({ sql: `${column(col)} != ?`, values: [toDb(this.table, col, value)] });
    return this;
  }
  in(col: string, values: unknown[]) {
    // one JSON value instead of one "?" per id: no limit on how many ids
    this.filters.push({
      sql: `${column(col)} IN (SELECT value FROM json_each(?))`,
      values: [JSON.stringify(values ?? [])],
    });
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orderBy.push(`${column(col)} ${opts.ascending === false ? "DESC" : "ASC"}`);
    return this;
  }
  limit(n: number) {
    this.limitN = Math.max(0, Math.floor(n));
    return this;
  }
  range(from: number, to: number) {
    this.offsetN = Math.max(0, Math.floor(from));
    this.limitN = Math.max(0, Math.floor(to - from + 1));
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }
  insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    this.mode = "insert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(
    rows: Record<string, unknown> | Record<string, unknown>[],
    opts: { onConflict?: string } = {},
  ) {
    this.mode = "upsert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    this.conflict = opts.onConflict ?? PRIMARY_KEY[this.table] ?? "id";
    return this;
  }
  update(changes: Record<string, unknown>) {
    this.mode = "update";
    this.changes = changes;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }

  then<A = StoreResult<T>, B = never>(
    onFulfilled?: ((value: StoreResult<T>) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(onFulfilled, onRejected);
  }

  private where(): { sql: string; values: unknown[] } {
    if (this.filters.length === 0) return { sql: "", values: [] };
    return {
      sql: ` WHERE ${this.filters.map((f) => f.sql).join(" AND ")}`,
      values: this.filters.flatMap((f) => f.values),
    };
  }

  private shape(rows: Record<string, unknown>[]): StoreResult<T> {
    const parsed = rows.map((r) => fromDb(this.table, r));
    if (this.one) {
      if (parsed.length === 0 && this.one === "single") {
        return { data: null, error: { code: "PGRST116", message: "لم يتم العثور على السجل" } };
      }
      return { data: (parsed[0] ?? null) as T, error: null };
    }
    return { data: parsed as T, error: null };
  }

  private async run(): Promise<StoreResult<T>> {
    try {
      await ensureSchema(this.db);
      const where = this.where();
      if (this.mode === "select") {
        let sql = `SELECT ${columnList(this.cols)} FROM ${this.table}${where.sql}`;
        if (this.orderBy.length) sql += ` ORDER BY ${this.orderBy.join(", ")}`;
        const values = [...where.values];
        if (this.limitN !== null || this.offsetN) {
          sql += " LIMIT ? OFFSET ?";
          values.push(this.limitN ?? -1, this.offsetN);
        }
        const res = await this.db
          .prepare(sql)
          .bind(...values)
          .all<Record<string, unknown>>();
        return this.shape(res.results ?? []);
      }
      const returning = this.returning ? ` RETURNING ${columnList(this.returning)}` : "";
      if (this.mode === "update") {
        const cols = Object.keys(this.changes).filter((c) => this.changes[c] !== undefined);
        if (cols.length === 0) return this.shape([]);
        // a saved product gets a new updated_at, so a stock deduction reading it before the
        // save knows it changed (see reserveStock)
        const touch =
          TOUCHED_TABLES.has(this.table) && !cols.includes("updated_at")
            ? ", updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
            : "";
        const sql = `UPDATE ${this.table} SET ${cols.map((c) => `${column(c)} = ?`).join(", ")}${touch}${where.sql}${returning}`;
        const values = [...cols.map((c) => toDb(this.table, c, this.changes[c])), ...where.values];
        const res = await this.db
          .prepare(sql)
          .bind(...values)
          .all<Record<string, unknown>>();
        return this.shape(res.results ?? []);
      }
      if (this.mode === "delete") {
        const res = await this.db
          .prepare(`DELETE FROM ${this.table}${where.sql}${returning}`)
          .bind(...where.values)
          .all<Record<string, unknown>>();
        return this.shape(res.results ?? []);
      }
      // insert / upsert: one statement per row, all in one transaction
      const statements = this.rows.map((input) => {
        const row: Record<string, unknown> = { ...input };
        if (UUID_TABLES.has(this.table) && (row["id"] === undefined || row["id"] === null)) {
          row["id"] = crypto.randomUUID();
        }
        const cols = Object.keys(row).filter((c) => row[c] !== undefined);
        let sql = `INSERT INTO ${this.table} (${cols.map(column).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
        if (this.mode === "upsert") {
          const key = column(this.conflict!);
          const set = cols.filter((c) => c !== key);
          sql += set.length
            ? ` ON CONFLICT(${key}) DO UPDATE SET ${set.map((c) => `${c} = excluded.${c}`).join(", ")}`
            : ` ON CONFLICT(${key}) DO NOTHING`;
        }
        sql += returning;
        return this.db.prepare(sql).bind(...cols.map((c) => toDb(this.table, c, row[c])));
      });
      const results = await this.db.batch(statements);
      const rows = results.flatMap((r) => (r.results ?? []) as Record<string, unknown>[]);
      return this.shape(rows);
    } catch (err) {
      return { data: null, error: { code: "D1", message: errorText(err) } };
    }
  }
}

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

// ---------- taking pieces from the stock (was reserve_stock_v2 inside Supabase) ----------
//
// Same rules: every chosen value's quantity and the product's total go down together, and if
// anything is short nothing changes at all. Each product is saved only if nobody changed it
// since it was read (updated_at); otherwise the whole thing is cancelled — the stock_guard
// line fails on purpose, which undoes the other writes of the same batch.

type StockLine = { id?: string; qty?: number; options?: { name: string; value: string }[] };
type RawVariable = { name?: unknown; values?: { label?: unknown; stock?: unknown }[] };

async function reserveStock(db: D1Database, items: StockLine[]): Promise<StoreError | null> {
  const lines = (Array.isArray(items) ? items : []).filter((l) => typeof l?.id === "string");
  const ids = [...new Set(lines.map((l) => l.id!))].sort();
  if (ids.length === 0) return null;
  const res = await db
    .prepare(
      "SELECT id, name, stock, variables, updated_at FROM menu_items WHERE id IN (SELECT value FROM json_each(?))",
    )
    .bind(JSON.stringify(ids))
    .all<{
      id: string;
      name: string;
      stock: number | null;
      variables: string;
      updated_at: string;
    }>();
  const rows = new Map((res.results ?? []).map((r) => [r.id, r]));
  const writes: D1PreparedStatement[] = [];
  for (const id of ids) {
    const row = rows.get(id);
    if (!row) return { message: "ITEM_NOT_FOUND" };
    let vars: RawVariable[] = [];
    try {
      const parsed = JSON.parse(row.variables || "[]");
      vars = Array.isArray(parsed) ? parsed : [];
    } catch {
      vars = [];
    }
    const hasValueStock = vars.some((v) =>
      (Array.isArray(v?.values) ? v.values : []).some((x) => typeof x?.stock === "number"),
    );
    let total = 0;
    for (const line of lines.filter((l) => l.id === id)) {
      const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
      total += qty;
      if (!hasValueStock || qty === 0) continue;
      for (const o of line.options ?? []) {
        const value = vars
          .find((v) => v?.name === o.name)
          ?.values?.find((x) => x?.label === o.value);
        if (value && typeof value.stock === "number") {
          const left = value.stock - qty;
          if (left < 0) return { message: `OUT_OF_STOCK:${row.name} (${o.value})` };
          value.stock = left;
        }
      }
    }
    let newStock: number | null;
    if (hasValueStock) {
      // the product's total = the smallest sum among variables whose values are all counted
      let min: number | null = null;
      for (const v of vars) {
        const values = Array.isArray(v?.values) ? v.values : [];
        if (values.length === 0) continue;
        if (!values.every((x) => typeof x?.stock === "number")) continue;
        const sum = values.reduce((s, x) => s + (x.stock as number), 0);
        if (min === null || sum < min) min = sum;
      }
      newStock = min;
    } else if (row.stock !== null && row.stock !== undefined) {
      if (row.stock < total) return { message: `OUT_OF_STOCK:${row.name}` };
      newStock = row.stock - total;
    } else {
      continue; // not counted: nothing to take
    }
    writes.push(
      db
        .prepare(
          "UPDATE menu_items SET stock = ?, variables = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND updated_at = ?",
        )
        .bind(newStock, JSON.stringify(vars), id, row.updated_at),
      // 1 - changes() is 0 when the line above saved the product, 1 (refused) when it didn't
      db.prepare("INSERT INTO stock_guard (n) VALUES (1 - changes())"),
    );
  }
  if (writes.length === 0) return null;
  writes.push(db.prepare("DELETE FROM stock_guard"));
  try {
    await db.batch(writes);
    return null;
  } catch (err) {
    const text = errorText(err);
    if (/CHECK constraint/i.test(text)) {
      return { message: "تغيّرت كمية أحد المنتجات في نفس اللحظة، حاولي مرة أخرى" };
    }
    return { message: text };
  }
}

// ---------- photos ----------

export const PHOTO_PATH = "/photos/";
const PHOTO_NAME = /^(thumbs\/)?[A-Za-z0-9._-]+$/;

export function isPhotoName(name: string) {
  return PHOTO_NAME.test(name);
}

function bytesOf(body: unknown): ArrayBuffer | ArrayBufferView {
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body as ArrayBuffer;
  throw new Error("صورة غير صالحة");
}

function storageBucket(kv: KVNamespace) {
  return {
    // (upsert / cacheControl from the Supabase call are accepted and not needed: a name is
    // always new, and /photos/ answers with a one-year cache itself)
    async upload(
      path: string,
      body: unknown,
      opts: { contentType?: string; upsert?: boolean; cacheControl?: string } = {},
    ) {
      try {
        if (!isPhotoName(path)) throw new Error("اسم الصورة غير صالح");
        await kv.put(path, bytesOf(body), {
          metadata: { contentType: opts.contentType || "image/jpeg" } satisfies PhotoMeta,
        });
        return { data: { path }, error: null };
      } catch (err) {
        return { data: null, error: { message: errorText(err) } };
      }
    },
    getPublicUrl(path: string) {
      return { data: { publicUrl: `${PHOTO_PATH}${path}` } };
    },
  };
}

// ---------- the store ----------

export async function getStore() {
  const env = await shopEnv();
  const db = env.DB;
  return {
    // Rows come back untyped (`any`), as the server code reads the columns it asked for.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(table: string): Query<any> {
      return new Query(db, table);
    },
    async rpc(name: string, args: { p_items?: StockLine[] } = {}) {
      if (name !== "reserve_stock_v2" && name !== "reserve_stock") {
        return { data: null, error: { code: "PGRST202", message: `no function ${name}` } };
      }
      try {
        await ensureSchema(db);
        const error = await reserveStock(db, args.p_items ?? []);
        return error ? { data: null, error } : { data: null, error: null };
      } catch (err) {
        return { data: null, error: { message: errorText(err) } };
      }
    },
    storage: {
      from: (_bucket: string) => storageBucket(env.PHOTOS),
    },
  };
}

export type Store = Awaited<ReturnType<typeof getStore>>;

// The raw pieces, for the few places that need them (photos, moving old photos).
export async function rawStore() {
  const env = await shopEnv();
  await ensureSchema(env.DB);
  return env;
}
