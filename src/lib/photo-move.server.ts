// Server-only. Copies the shop's photos that are still in the old Supabase storage into
// Cloudflare KV, a few at a time (the control panel calls it again and again while it's open,
// showing the progress). The shop also copies any photo by itself the first time a customer
// asks for it (src/lib/photo-serve.server.ts).

import { rawStore } from "@/lib/store.server";
import { copyFromOldStorage } from "@/lib/photo-serve.server";
import { OLD_PHOTO_BASE } from "@/lib/store-import.server";

export type PhotoMoveProgress = {
  // photos the shop uses
  total: number;
  // already in Cloudflare
  done: number;
  // Supabase doesn't have them at all: they need uploading again
  missing: number;
  // still to copy
  left: number;
  // can't go on for now — try again later: "supabase" = Supabase is refusing (its monthly
  // limit), "daily-limit" = Cloudflare's 1,000 photo saves a day are used up (goes on tomorrow)
  blocked: boolean;
  reason: "supabase" | "daily-limit" | null;
};

const OWN_PHOTO = /\/photos\/([A-Za-z0-9._-]+)/g;

// Every photo name the shop refers to: products (main, extra and value photos), categories,
// ads and the background photo.
async function photosInUse(db: Awaited<ReturnType<typeof rawStore>>["DB"]) {
  const texts: string[] = [];
  const queries = [
    // (COALESCE: in SQL, joining anything to an empty main photo would give nothing at all)
    "SELECT COALESCE(image_url, '') || ' ' || COALESCE(extra_images, '') || ' ' || COALESCE(variables, '') AS t FROM menu_items",
    "SELECT image_url AS t FROM categories",
    "SELECT image_url AS t FROM promotions",
    "SELECT hero_image_url AS t FROM site_settings",
  ];
  const results = await db.batch(queries.map((q) => db.prepare(q)));
  for (const r of results)
    for (const row of (r.results ?? []) as { t: string | null }[]) {
      if (row.t) texts.push(row.t);
    }
  const names = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(OWN_PHOTO)) names.add(m[1]!);
  return names;
}

export async function copyOldPhotosBatch(batch = 4): Promise<PhotoMoveProgress> {
  const env = await rawStore();
  const db = env.DB;
  const inUse = await photosInUse(db);
  const states = new Map(
    (
      ((await db.prepare("SELECT name, state FROM moved_photos").all()).results ?? []) as {
        name: string;
        state: string;
      }[]
    ).map((r) => [r.name, r.state]),
  );
  const todo = [...inUse].filter((n) => !states.has(n));
  let blocked = false;
  let reason: PhotoMoveProgress["reason"] = null;
  for (const name of todo.slice(0, OLD_PHOTO_BASE ? batch : 0)) {
    // uploaded in Cloudflare already (a new photo)?
    const here = await env.PHOTOS.getWithMetadata(name, { type: "stream" });
    if (here.value) {
      await here.value.cancel().catch(() => {});
      states.set(name, "ok");
      await db
        .prepare("INSERT OR REPLACE INTO moved_photos (name, state) VALUES (?, 'ok')")
        .bind(name)
        .run();
      continue;
    }
    // ask Supabase directly first, to tell "locked" apart from "not there"
    let status = 0;
    try {
      status = (await fetch(`${OLD_PHOTO_BASE}${name}`, { method: "HEAD" })).status;
    } catch {
      status = 0;
    }
    if (status === 400 || status === 404) {
      states.set(name, "missing");
      await db
        .prepare("INSERT OR REPLACE INTO moved_photos (name, state) VALUES (?, 'missing')")
        .bind(name)
        .run();
      continue;
    }
    const copied = await copyFromOldStorage(name, true);
    if (!copied || !copied.saved) {
      blocked = true;
      reason = copied ? "daily-limit" : "supabase";
      break;
    }
    states.set(name, "ok");
    // its light copy too, when Supabase has one (otherwise the control panel makes it)
    await copyFromOldStorage(`thumbs/${name}`, true);
  }
  let done = 0;
  let missing = 0;
  for (const name of inUse) {
    const st = states.get(name);
    if (st === "ok") done++;
    else if (st === "missing") missing++;
  }
  return {
    total: inUse.size,
    done,
    missing,
    left: inUse.size - done - missing,
    blocked,
    reason,
  };
}
