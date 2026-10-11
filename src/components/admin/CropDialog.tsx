import { useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import {
  autoCropToBase64,
  CROP_HEIGHT,
  CROP_WIDTH,
  cropToBase64,
  prepareImage,
  type CropArea,
} from "@/lib/image";
import { useBackClose, useLockScroll } from "@/lib/back-layer";
import { arCount } from "@/lib/utils";

// `thumbBase64` = the light copy shown on cards (see src/lib/photos.ts).
export type CroppedImage = {
  base64: string;
  contentType: string;
  filename: string;
  thumbBase64?: string;
};

// Output size decides the shape: 960×1280 (3:4) for product and ad photos by default,
// or e.g. SQUARE_CROP for category photos.
const jpgName = (file: File) => file.name.replace(/\.[^.]+$/, "") + ".jpg";

export function CropDialog({
  file,
  onCancel,
  onDone,
  output = { width: CROP_WIDTH, height: CROP_HEIGHT },
  step,
}: {
  file: File | null;
  onCancel: () => void;
  onDone: (image: CroppedImage) => void;
  output?: { width: number; height: number };
  // several photos picked at once: which one this is, and the buttons to move on
  step?: { index: number; total: number; onSkip: () => void; onAutoRest: () => void };
}) {
  // The photo turned upright and scaled down once (see prepareImage): the cropper shows it
  // and the crop is cut from it, so they always match, even for huge iPhone photos.
  const [prepared, setPrepared] = useState<{ blob: Blob; url: string } | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<CropArea | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = file !== null;
  useBackClose(open, onCancel); // phone's back button = إلغاء
  useLockScroll(open);

  useEffect(() => {
    setPrepared(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    setError(null);
    setBusy(false);
    if (!file) return;
    // Close the keyboard first: with it open, iPhone shifts the screen and the buttons below
    // the photo can end up out of reach.
    (document.activeElement as HTMLElement | null)?.blur?.();
    let cancelled = false;
    let url: string | null = null;
    prepareImage(file)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPrepared({ blob, url });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "تعذّر فتح الصورة");
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  if (!file) return null;
  const many = !!step && step.total > 1;
  const left = step ? step.total - step.index : 0;

  async function confirm() {
    if (!file || !prepared || !area || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { base64, contentType, thumbBase64 } = await cropToBase64(
        prepared.blob,
        area,
        0.88,
        output.width,
        output.height,
      );
      onDone({
        base64,
        contentType,
        ...(thumbBase64 ? { thumbBase64 } : {}),
        filename: jpgName(file),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر قص الصورة");
      setBusy(false);
    }
  }

  return (
    // 100dvh = the part of the screen Safari actually shows, so the buttons are never hidden
    // under its toolbar; touch-none stops the page behind from moving while dragging.
    <div className="fixed inset-x-0 top-0 z-[60] flex h-[100dvh] touch-none flex-col bg-black select-none">
      <p className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2 text-center text-sm text-white/80">
        {many && (
          <span className="mb-1 block text-base font-bold text-white">
            صورة {step.index + 1} من {step.total}
          </span>
        )}
        حرّكي الصورة وكبّريها بإصبعين لاختيار الجزء الظاهر
      </p>
      {/* Cropper math is positional; keep it LTR regardless of the page direction. */}
      <div dir="ltr" className="relative min-h-0 flex-1">
        {prepared ? (
          <Cropper
            image={prepared.url}
            crop={crop}
            zoom={zoom}
            aspect={output.width / output.height}
            maxZoom={4}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
            objectFit="contain"
            showGrid
          />
        ) : (
          !error && (
            <div className="flex h-full items-center justify-center text-sm text-white/70">
              جارِ تجهيز الصورة...
            </div>
          )
        )}
      </div>
      <div className="space-y-3 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <input
          dir="ltr"
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          disabled={!prepared}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="تكبير"
          className="w-full accent-[var(--primary)]"
        />
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-12 flex-1 rounded-full border border-white/30 px-2 text-sm whitespace-nowrap text-white"
          >
            {many ? "إيقاف" : "إلغاء"}
          </button>
          {many && (
            <button
              type="button"
              onClick={step.onSkip}
              disabled={busy}
              className="h-12 flex-1 rounded-full border border-white/30 px-2 text-sm whitespace-nowrap text-white"
            >
              تخطي
            </button>
          )}
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !area || !prepared}
            className="h-12 flex-1 rounded-full px-2 text-sm whitespace-nowrap font-medium text-primary-foreground disabled:opacity-60"
            style={{ backgroundImage: "var(--gradient-pink)" }}
          >
            {busy ? "جارِ القص..." : "قص واستخدام"}
          </button>
        </div>
        {many && left > 1 && (
          <button
            type="button"
            onClick={step.onAutoRest}
            disabled={busy}
            className="h-11 w-full rounded-full bg-white/10 px-4 text-sm text-white"
          >
            قص {arCount(left, ["هذه الصورة", "الصورتين", "صور", "صورة"])} تلقائيًا من الوسط
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- several photos picked at once ----------
//
// Shows the crop screen for each picked photo in turn ("صورة 3 من 40"). Each one can be
// cropped by hand or skipped, or the rest can all be cropped automatically from the centre —
// one after another in the background of this screen, so a phone's memory is never full.
// `onCropped` is called for every photo as soon as it's ready (the upload can start right
// away), in the order the photos were picked.

export type CropBatch<T> = { files: File[]; tag: T };

export function CropQueue<T>({
  batch,
  output = { width: CROP_WIDTH, height: CROP_HEIGHT },
  onCropped,
  onFinish,
}: {
  batch: CropBatch<T> | null;
  output?: { width: number; height: number };
  onCropped: (image: CroppedImage, tag: T, index: number) => void;
  // failed = photos that couldn't be opened (e.g. a format the phone can't read)
  onFinish: (result: { failed: number }) => void;
}) {
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState<{ done: number; total: number } | null>(null);
  const stopAuto = useRef(false);

  useEffect(() => {
    setIndex(0);
    setAuto(null);
    stopAuto.current = false;
  }, [batch]);

  useLockScroll(!!auto && !!batch);

  useEffect(() => {
    if (batch && !auto && index >= batch.files.length) onFinish({ failed: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch, index, auto]);

  if (!batch) return null;
  const current = batch;

  async function autoRest() {
    const from = index;
    let failed = 0;
    stopAuto.current = false;
    setAuto({ done: 0, total: current.files.length - from });
    for (let i = from; i < current.files.length && !stopAuto.current; i++) {
      const file = current.files[i]!;
      try {
        const out = await autoCropToBase64(file, output.width, output.height);
        onCropped(
          {
            base64: out.base64,
            contentType: out.contentType,
            ...(out.thumbBase64 ? { thumbBase64: out.thumbBase64 } : {}),
            filename: jpgName(file),
          },
          current.tag,
          i,
        );
      } catch {
        failed++;
      }
      setAuto((a) => (a ? { ...a, done: a.done + 1 } : a));
    }
    setAuto(null);
    onFinish({ failed });
  }

  if (auto) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
        <p className="text-lg font-bold">جارِ تجهيز الصور…</p>
        <p className="text-sm text-white/80">
          {auto.done} من {auto.total}
        </p>
        <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{ width: `${Math.round((auto.done / Math.max(1, auto.total)) * 100)}%` }}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            stopAuto.current = true;
          }}
          className="mt-2 h-11 rounded-full border border-white/40 px-6 text-sm"
        >
          إيقاف
        </button>
      </div>
    );
  }

  const file = current.files[index] ?? null;
  return (
    <CropDialog
      file={file}
      output={output}
      onCancel={() => onFinish({ failed: 0 })}
      onDone={(image) => {
        onCropped(image, current.tag, index);
        setIndex((i) => i + 1);
      }}
      step={{
        index,
        total: current.files.length,
        onSkip: () => setIndex((i) => i + 1),
        onAutoRest: () => void autoRest(),
      }}
    />
  );
}
