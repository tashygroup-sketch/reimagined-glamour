import { THUMB_MAX_HEIGHT, THUMB_MAX_WIDTH } from "@/lib/photos";

// ---------- photo processing (runs in the browser) ----------
//
// Written for iPhone Safari, which is where uploads were failing:
//  * No createImageBitmap(): older iPhones don't have it, and on the ones that do, the
//    { imageOrientation } option isn't reliably supported. A plain <img> works everywhere
//    and Safari already turns it the right way up (EXIF rotation) when drawing it.
//  * Every canvas is shrunk to 0×0 as soon as it's done. Safari keeps canvas memory until
//    garbage collection and has a hard total limit, so after a few photos getContext() or
//    toBlob() started failing — the "works sometimes" upload bug.
//  * Big camera photos (12–48 MP) are scaled down once, before the crop screen, so the
//    cropper and every step after it work on a small image.

// Every menu and ad photo is cropped to this exact size, matching the shop's reference
// photo (960×1280, a 3:4 portrait), so all cards and slides are the same shape.
export const CROP_WIDTH = 960;
export const CROP_HEIGHT = 1280;
export const CROP_ASPECT = CROP_WIDTH / CROP_HEIGHT;

// Category squares on the home page.
export const SQUARE_CROP = { width: 900, height: 900 } as const;

export type CropArea = { x: number; y: number; width: number; height: number };

// Light copies for cards (see src/lib/photos.ts): the photo scaled to fit inside this box.
const THUMB_QUALITY = 0.72;

function thumbSize(w0: number, h0: number) {
  const scale = Math.min(1, THUMB_MAX_WIDTH / w0, THUMB_MAX_HEIGHT / h0);
  return { w: Math.max(1, Math.round(w0 * scale)), h: Math.max(1, Math.round(h0 * scale)) };
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("تعذّر فتح الصورة، جرّبي صورة أخرى (JPG أو PNG)"));
    };
    img.src = url;
  });
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    releaseCanvas(canvas);
    throw new Error("تعذّرت معالجة الصورة، أغلقي بعض التبويبات وحاولي مرة أخرى");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

// Frees the canvas memory right away instead of waiting for Safari's garbage collector.
function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("تعذّر حفظ الصورة، حاولي مرة أخرى"))),
      "image/jpeg",
      quality,
    ),
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("تعذّرت قراءة الصورة"));
    reader.readAsDataURL(blob);
  });
}

// Draws the photo (upright, scaled to w × h) onto a fresh canvas and returns it as a JPEG.
async function drawToJpeg(
  img: HTMLImageElement,
  w: number,
  h: number,
  quality: number,
  source?: CropArea,
): Promise<Blob> {
  const { canvas, ctx } = makeCanvas(w, h);
  try {
    ctx.fillStyle = "#ffffff"; // transparent PNGs become white, not black
    ctx.fillRect(0, 0, w, h);
    if (source) ctx.drawImage(img, source.x, source.y, source.width, source.height, 0, 0, w, h);
    else ctx.drawImage(img, 0, 0, w, h);
    return await canvasToJpeg(canvas, quality);
  } finally {
    releaseCanvas(canvas);
  }
}

function scaledSize(img: HTMLImageElement, maxDim: number) {
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  if (!w0 || !h0) throw new Error("تعذّر فتح الصورة، جرّبي صورة أخرى (JPG أو PNG)");
  const scale = Math.min(1, maxDim / Math.max(w0, h0));
  return { w: Math.max(1, Math.round(w0 * scale)), h: Math.max(1, Math.round(h0 * scale)) };
}

// The photo, turned upright and scaled so its longest side is at most maxDim, as a JPEG.
// The crop screen shows this version and crops from it, so the crop box always lines up.
export async function prepareImage(file: Blob, maxDim = 2048): Promise<Blob> {
  const img = await loadImage(file);
  const { w, h } = scaledSize(img, maxDim);
  return drawToJpeg(img, w, h, 0.92);
}

// Cuts `area` (in the pixels of `source`, which must be the prepareImage() output the crop
// screen showed) and scales it to exactly width × height.
export async function cropToBase64(
  source: Blob,
  area: CropArea,
  quality = 0.88,
  width: number = CROP_WIDTH,
  height: number = CROP_HEIGHT,
) {
  const img = await loadImage(source);
  const blob = await drawToJpeg(img, width, height, quality, area);
  // The light copy for cards is cut from the same area. If it can't be made (phone short on
  // memory), the upload still goes ahead with the full photo only.
  let thumbBase64: string | undefined;
  try {
    const { w, h } = thumbSize(width, height);
    thumbBase64 = await blobToBase64(await drawToJpeg(img, w, h, THUMB_QUALITY, area));
  } catch {
    thumbBase64 = undefined;
  }
  return { base64: await blobToBase64(blob), contentType: "image/jpeg", thumbBase64 };
}

// A light copy of an already uploaded photo (for photos uploaded before light copies existed).
export async function makeThumbBase64(photo: Blob): Promise<string> {
  const img = await loadImage(photo);
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("ليست صورة صالحة");
  const { w, h } = thumbSize(img.naturalWidth, img.naturalHeight);
  return blobToBase64(await drawToJpeg(img, w, h, THUMB_QUALITY));
}

// Resize + compress without cropping (the hero background photo).
export async function fileToCompressedBase64(file: File, maxDim = 1600, quality = 0.85) {
  const img = await loadImage(file);
  const { w, h } = scaledSize(img, maxDim);
  const blob = await drawToJpeg(img, w, h, quality);
  return { base64: await blobToBase64(blob), contentType: "image/jpeg" };
}

class UploadTimeoutError extends Error {}

// Phone networks drop requests. Gives an upload a time limit (so a photo can never stay on
// "..." forever) and one automatic retry when the connection failed — but not when the server
// answered with an error, which would only fail again.
export async function withUploadRetry<T>(run: () => Promise<T>, timeoutMs = 60000): Promise<T> {
  const attempt = () =>
    new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(
        () =>
          reject(
            new UploadTimeoutError("انتهت مهلة رفع الصورة، تأكدي من الإنترنت وحاولي مرة أخرى"),
          ),
        timeoutMs,
      );
      run().then(
        (v) => {
          window.clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          window.clearTimeout(timer);
          reject(e);
        },
      );
    });
  try {
    return await attempt();
  } catch (err) {
    // TypeError = the request never reached the server ("Load failed" on iPhone)
    if (!(err instanceof TypeError || err instanceof UploadTimeoutError)) throw err;
    try {
      return await attempt();
    } catch (err2) {
      if (err2 instanceof TypeError) {
        throw new Error("تعذّر الاتصال، تأكدي من الإنترنت وحاولي مرة أخرى");
      }
      throw err2;
    }
  }
}

// Normalizes any phone the customer typed (local "0..." or international "218...") into the
// international digits wa.me expects. Not a secret — just formatting, safe to ship to the client.
export function toIntlLibyaPhone(raw: string) {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00218")) digits = digits.slice(2);
  if (digits.startsWith("218")) return digits;
  if (digits.startsWith("0")) return `218${digits.slice(1)}`;
  return `218${digits}`;
}

export function waLink(rawPhone: string, text?: string) {
  const number = toIntlLibyaPhone(rawPhone);
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${number}${query}`;
}
