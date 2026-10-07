// ---------- light copies of the photos, and what the browser has already downloaded ----------
//
// A product photo is stored at 960×1280 (about 150–300 KB) but a card shows it only ~180px
// wide. Downloading the full photo for every card is what made cards fill in slowly, one by
// one, and sometimes not at all on a weak connection.
//
// So every photo also has a light copy (about 480px wide, 25–45 KB) stored next to it:
//
//     …/menu-photos/<name>.jpg           the full photo (product page)
//     …/menu-photos/thumbs/<name>.jpg    the light copy (cards, category squares, the cart)
//
// The light copy is made in the owner's browser: when a photo is uploaded, and — for photos
// uploaded before this existed — in the background whenever the control panel is open
// (src/lib/thumbs.ts). A photo whose light copy doesn't exist yet simply falls back to the
// full photo.
//
// The shop downloads the light copies of the whole catalogue quietly in the background as
// soon as the page opens, so by the time a customer opens a category its photos are already
// on the phone and appear at once.

// Same rule as ownPhotoName() on the server: a file directly inside the menu-photos bucket.
const BUCKET_PHOTO = /^(.*\/storage\/v1\/object\/public\/menu-photos\/)([A-Za-z0-9._-]+)$/;

// Light copies fit inside this box (the 3:4 product shape, or 480×480 for category squares).
export const THUMB_MAX_WIDTH = 480;
export const THUMB_MAX_HEIGHT = 640;

// Address of a photo's light copy, or null when the photo isn't one of the shop's own
// uploaded photos (nothing to derive a light copy from).
export function thumbUrl(url: string | null | undefined): string | null {
  const m = url ? BUCKET_PHOTO.exec(url) : null;
  return m ? `${m[1]}thumbs/${m[2]}` : null;
}

// What this page has learned so far about each address. Lives only in the browser tab.
type Known = "loaded" | "missing";
const known = new Map<string, Known>();
// Keeps downloaded photos alive in the browser's memory so showing them later is instant.
const kept = new Map<string, HTMLImageElement>();
const inFlight = new Map<string, Promise<boolean>>();

export const isLoaded = (url: string) => known.get(url) === "loaded";
export const isMissing = (url: string) => known.get(url) === "missing";
export const markLoaded = (url: string) => void known.set(url, "loaded");
export const markMissing = (url: string) => void known.set(url, "missing");
// After a light copy has just been created: forget that it used to be missing.
export const forget = (url: string) => void known.delete(url);

// Downloads one photo (once). Resolves true when it's on the phone, false when it failed.
export function preload(url: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (isLoaded(url)) return Promise.resolve(true);
  if (isMissing(url)) return Promise.resolve(false);
  const running = inFlight.get(url);
  if (running) return running;
  const promise = new Promise<boolean>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      kept.set(url, img);
      markLoaded(url);
      inFlight.delete(url);
      resolve(true);
    };
    img.onerror = () => {
      markMissing(url);
      inFlight.delete(url);
      resolve(false);
    };
    img.src = url;
  });
  inFlight.set(url, promise);
  return promise;
}

// Downloads many photos in the given order, a few at a time so the photos on screen keep
// most of the connection. Returns a function that stops it (photos already started finish).
export function preloadAll(urls: string[], atOnce = 6): () => void {
  const queue = [...new Set(urls)].filter((u) => !isLoaded(u) && !isMissing(u));
  let stopped = false;
  async function worker() {
    while (!stopped) {
      const next = queue.shift();
      if (!next) return;
      await preload(next);
    }
  }
  for (let i = 0; i < Math.min(atOnce, queue.length); i++) void worker();
  return () => {
    stopped = true;
  };
}
