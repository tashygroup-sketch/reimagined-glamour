// ---------- light copies for photos that don't have one yet (runs in the control panel) ----------
//
// Photos uploaded before light copies existed only have the full photo. While the control
// panel is open, this goes through the shop's photos in the background; for each one without
// a light copy it downloads the photo, shrinks it in the browser and stores the result (see
// src/lib/photos.ts for where). It also notices photos whose file can't be downloaded at all
// — those are the ones that never appear in the shop — so the owner can upload them again.

import { makeThumbBase64 } from "@/lib/image";
import { forget, preload, thumbUrl } from "@/lib/photos";

export type ThumbJob = { url: string; label: string };
export type BrokenPhoto = { label: string; reason: string };
export type ThumbProgress = {
  // photos still being looked at in this pass (0 = finished)
  left: number;
  // light copies created since the control panel was opened
  made: number;
  // photos whose file could not be downloaded
  broken: BrokenPhoto[];
};

type Tools = {
  save: (url: string, dataBase64: string) => Promise<unknown>;
  // the photo's bytes through the shop's server, for browsers not allowed to read storage
  viaServer: (
    url: string,
  ) => Promise<{ ok: true; base64: string; contentType: string } | { ok: false; status: number }>;
};

// Remembered for as long as the control panel stays open, so each photo is handled once.
const finished = new Set<string>();
const brokenReason = new Map<string, string>();
let madeCount = 0;

function reasonFor(status: number) {
  return status === 400 || status === 404 ? "الملف غير موجود في التخزين" : `خطأ ${status}`;
}

function base64ToBlob(base64: string, contentType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

// The full photo's bytes, or why it can't be had.
async function download(url: string, tools: Tools): Promise<Blob | { reason: string }> {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.blob();
    return { reason: reasonFor(res.status) };
  } catch {
    // Either the phone is offline or the browser isn't allowed to read storage directly:
    // ask the shop's server for the same photo.
    const res = await tools.viaServer(url);
    if (res.ok) return base64ToBlob(res.base64, res.contentType);
    return { reason: reasonFor(res.status) };
  }
}

// One photo is never worked on twice at once: a new pass that starts while the previous one
// is still finishing a photo waits for that same work instead of repeating it.
const running = new Map<string, Promise<void>>();

function handleOne(url: string, tools: Tools): Promise<void> {
  const already = running.get(url);
  if (already) return already;
  const work = makeOne(url, tools).finally(() => running.delete(url));
  running.set(url, work);
  return work;
}

async function makeOne(url: string, tools: Tools) {
  const small = thumbUrl(url);
  if (!small || finished.has(url)) return;
  if (await preload(small)) {
    finished.add(url);
    return;
  }
  const photo = await download(url, tools);
  if (!(photo instanceof Blob)) {
    brokenReason.set(url, photo.reason);
    finished.add(url);
    return;
  }
  let thumb: string;
  try {
    thumb = await makeThumbBase64(photo);
  } catch {
    brokenReason.set(url, "الملف ليس صورة صالحة");
    finished.add(url);
    return;
  }
  await tools.save(url, thumb);
  forget(small); // it exists now
  madeCount++;
  finished.add(url);
}

// Goes through `jobs` two at a time, reporting progress. `stopped()` lets the caller end it
// early (the panel was closed, or the product list changed and a new pass is starting).
export async function ensureThumbs(
  jobs: ThumbJob[],
  tools: Tools,
  onProgress: (p: ThumbProgress) => void,
  stopped: () => boolean,
) {
  const labels = new Map<string, string>();
  for (const j of jobs) if (thumbUrl(j.url) && !labels.has(j.url)) labels.set(j.url, j.label);
  const queue = [...labels.keys()].filter((url) => !finished.has(url));
  let left = queue.length;

  const report = () =>
    onProgress({
      left,
      made: madeCount,
      broken: [...labels]
        .filter(([url]) => brokenReason.has(url))
        .map(([url, label]) => ({ label, reason: brokenReason.get(url)! })),
    });

  report();
  async function worker() {
    while (!stopped()) {
      const url = queue.shift();
      if (!url) return;
      try {
        await handleOne(url, tools);
      } catch {
        // Couldn't reach the server this time (weak connection): left for the next pass.
      }
      left--;
      if (!stopped()) report();
    }
  }
  await Promise.all([worker(), worker()]);
}
