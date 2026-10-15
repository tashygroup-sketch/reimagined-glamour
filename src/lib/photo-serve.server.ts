// Server-only. Serves the shop's photos from Cloudflare KV at /photos/<name> (and the light
// copies at /photos/thumbs/<name>), called from src/server.ts.
//
// A photo that isn't in KV yet is one of the photos still kept in the old Supabase storage:
// it's fetched from there once, saved in KV, and from then on served from KV. While Supabase
// refuses (its monthly limit), the photo simply isn't shown yet — it comes over by itself as
// soon as Supabase lets it out (the control panel can also copy them all at once).

import { isPhotoName, rawStore, shopEnv } from "@/lib/store.server";
import { OLD_PHOTO_BASE } from "@/lib/store-import.server";

// Photos never change (each upload gets a new name), so browsers may keep them for a year.
const CACHE_HEADER = "public, max-age=31536000, immutable";

// Old photos Supabase refused recently: not asked again for a few minutes.
const refusedUntil = new Map<string, number>();
const RETRY_AFTER_MS = 10 * 60_000;

type Meta = { contentType?: string };

function photoResponse(body: BodyInit | null, contentType: string, head: boolean) {
  return new Response(head ? null : body, {
    status: 200,
    headers: { "content-type": contentType, "cache-control": CACHE_HEADER },
  });
}

// Cloudflare's own cache in front of KV, where it's available (never required).
function edgeCache(): Cache | null {
  const caches = (globalThis as { caches?: { default?: Cache } }).caches;
  return caches?.default ?? null;
}

export async function servePhoto(request: Request, name: string): Promise<Response> {
  if (!isPhotoName(name)) return new Response("Not found", { status: 404 });
  const head = request.method === "HEAD";
  const cache = edgeCache();
  const cacheKey = new Request(new URL(request.url).toString(), { method: "GET" });
  if (cache && !head) {
    const hit = await cache.match(cacheKey).catch(() => undefined);
    if (hit) return hit;
  }

  const env = await shopEnv();
  const found = await env.PHOTOS.getWithMetadata<Meta>(name, { type: "stream" });
  if (found.value) {
    if (head) {
      await found.value.cancel().catch(() => {});
      return photoResponse(null, found.metadata?.contentType || "image/jpeg", true);
    }
    const response = photoResponse(found.value, found.metadata?.contentType || "image/jpeg", false);
    if (cache) await cache.put(cacheKey, response.clone()).catch(() => {});
    return response;
  }

  // Not in KV: one of the photos still in the old Supabase storage?
  const bytes = await copyFromOldStorage(name);
  if (!bytes) return new Response("Not found", { status: 404 });
  return photoResponse(bytes.data, bytes.contentType, head);
}

// Copies one photo from the old Supabase storage into KV. Returns its bytes, or null when
// Supabase doesn't have it or won't give it now. `force` (the control panel copying them all)
// asks again even if Supabase refused it a moment ago; customers' visits don't.
export async function copyFromOldStorage(
  name: string,
  force = false,
): Promise<{ data: ArrayBuffer; contentType: string; saved: boolean } | null> {
  if (!OLD_PHOTO_BASE) return null;
  if (!force && (refusedUntil.get(name) ?? 0) > Date.now()) return null;
  let res: Response;
  try {
    res = await fetch(`${OLD_PHOTO_BASE}${name}`);
  } catch {
    refusedUntil.set(name, Date.now() + RETRY_AFTER_MS);
    return null;
  }
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok || !contentType.startsWith("image/")) {
    refusedUntil.set(name, Date.now() + RETRY_AFTER_MS);
    return null;
  }
  refusedUntil.delete(name);
  const data = await res.arrayBuffer();
  let saved = false;
  try {
    const env = await rawStore();
    await env.PHOTOS.put(name, data, { metadata: { contentType } satisfies Meta });
    saved = true;
    if (!name.startsWith("thumbs/")) {
      await env.DB.prepare("INSERT OR REPLACE INTO moved_photos (name, state) VALUES (?, 'ok')")
        .bind(name)
        .run();
    }
  } catch {
    // KV's daily allowance of saves (1,000 a day on the free plan) is used up: the photo is
    // shown this time and saved another day
  }
  return { data, contentType, saved };
}
