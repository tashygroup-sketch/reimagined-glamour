import { useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import { CROP_ASPECT, cropToBase64, type CropArea } from "@/lib/image";

export type CroppedImage = { base64: string; contentType: string; filename: string };

export function CropDialog({
  file,
  onCancel,
  onDone,
}: {
  file: File | null;
  onCancel: () => void;
  onDone: (image: CroppedImage) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<CropArea | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setSrc(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    setError(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!file || !src) return null;

  async function confirm() {
    if (!file || !area) return;
    setBusy(true);
    setError(null);
    try {
      const { base64, contentType } = await cropToBase64(file, area);
      onDone({ base64, contentType, filename: file.name.replace(/\.[^.]+$/, "") + ".jpg" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر قص الصورة");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <p className="px-4 pt-4 pb-2 text-center text-sm text-white/80">
        حرّكي الصورة وكبّريها لاختيار الجزء الظاهر
      </p>
      {/* Cropper math is positional; keep it LTR regardless of the page direction. */}
      <div dir="ltr" className="relative flex-1">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={CROP_ASPECT}
          maxZoom={4}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => setArea(pixels)}
          objectFit="contain"
          showGrid
        />
      </div>
      <div className="space-y-3 p-4">
        <input
          dir="ltr"
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
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
            className="flex-1 rounded-full border border-white/30 px-4 py-3 text-sm text-white"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !area}
            className="flex-1 rounded-full px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
            style={{ backgroundImage: "var(--gradient-pink)" }}
          >
            {busy ? "جارِ القص..." : "قص واستخدام"}
          </button>
        </div>
      </div>
    </div>
  );
}
