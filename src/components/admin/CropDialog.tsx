import { useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import { CROP_HEIGHT, CROP_WIDTH, cropToBase64, prepareImage, type CropArea } from "@/lib/image";
import { useBackClose, useLockScroll } from "@/lib/back-layer";

export type CroppedImage = { base64: string; contentType: string; filename: string };

// Output size decides the shape: 960×1280 (3:4) for product and ad photos by default,
// or e.g. SQUARE_CROP for category photos.
export function CropDialog({
  file,
  onCancel,
  onDone,
  output = { width: CROP_WIDTH, height: CROP_HEIGHT },
}: {
  file: File | null;
  onCancel: () => void;
  onDone: (image: CroppedImage) => void;
  output?: { width: number; height: number };
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

  async function confirm() {
    if (!file || !prepared || !area || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { base64, contentType } = await cropToBase64(
        prepared.blob,
        area,
        0.88,
        output.width,
        output.height,
      );
      onDone({ base64, contentType, filename: file.name.replace(/\.[^.]+$/, "") + ".jpg" });
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
            className="h-12 flex-1 rounded-full border border-white/30 px-4 text-sm text-white"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !area || !prepared}
            className="h-12 flex-1 rounded-full px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
            style={{ backgroundImage: "var(--gradient-pink)" }}
          >
            {busy ? "جارِ القص..." : "قص واستخدام"}
          </button>
        </div>
      </div>
    </div>
  );
}
