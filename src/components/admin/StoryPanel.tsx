import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  getStorySection,
  saveStorySettings,
  addPromotion,
  deletePromotion,
  uploadMenuImage,
  saveHeroImage,
  saveHeroText,
} from "@/lib/shop.functions";
import { fileToCompressedBase64 } from "@/lib/image";
import { ConfirmDialog } from "./ConfirmDialog";
import { CropDialog, type CroppedImage } from "./CropDialog";

type StoryData = Awaited<ReturnType<typeof getStorySection>>;

export function StoryPanel({ phone }: { phone: string }) {
  const fetchStory = useServerFn(getStorySection);
  const save = useServerFn(saveStorySettings);
  const addImage = useServerFn(addPromotion);
  const removeImage = useServerFn(deletePromotion);
  const upload = useServerFn(uploadMenuImage);
  const setHero = useServerFn(saveHeroImage);
  const saveHeroCopy = useServerFn(saveHeroText);
  const queryClient = useQueryClient();

  const [data, setData] = useState<StoryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ story_label: "", story_title: "", story_text: "" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [heroBusy, setHeroBusy] = useState(false);
  const [heroError, setHeroError] = useState<string | null>(null);
  const [removeHeroOpen, setRemoveHeroOpen] = useState(false);
  const [heroForm, setHeroForm] = useState({ hero_title: "", hero_subtitle: "" });
  const [heroTextBusy, setHeroTextBusy] = useState(false);
  const [heroTextSaved, setHeroTextSaved] = useState(false);

  async function load() {
    try {
      const res = await fetchStory();
      setData(res);
      setForm({
        story_label: res.story_label,
        story_title: res.story_title,
        story_text: res.story_text,
      });
      setHeroForm({ hero_title: res.hero_title, hero_subtitle: res.hero_subtitle });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل محتوى القسم");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshPublicStory() {
    queryClient.invalidateQueries({ queryKey: ["story"] });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      await save({ data: { phone, ...form } });
      setSaved(true);
      refreshPublicStory();
    } catch (err) {
      alert(err instanceof Error ? err.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  }

  function pickAdPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setCropFile(file);
  }

  // Ad photo arrives already cropped to 960×1280 by the crop screen.
  async function handleCroppedAd(image: CroppedImage) {
    setCropFile(null);
    setUploading(true);
    setUploadError(null);
    try {
      const res = await upload({
        data: {
          phone,
          filename: image.filename,
          contentType: image.contentType,
          dataBase64: image.base64,
        },
      });
      await addImage({ data: { phone, image_url: res.url, ratio: res.ratio } });
      await load();
      refreshPublicStory();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "تعذّر رفع الصورة");
    } finally {
      setUploading(false);
    }
  }

  // The hero photo is a full-screen background (shown with object-cover), so it isn't cropped
  // to the 3:4 menu shape — it's just compressed and stored.
  async function handleHeroFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setHeroBusy(true);
    setHeroError(null);
    try {
      const { base64, contentType } = await fileToCompressedBase64(file, 1920, 0.82);
      const res = await upload({
        data: { phone, filename: file.name, contentType, dataBase64: base64 },
      });
      await setHero({ data: { phone, hero_image_url: res.url } });
      await load();
      refreshPublicStory();
    } catch (err) {
      setHeroError(err instanceof Error ? err.message : "تعذّر رفع الصورة");
    } finally {
      setHeroBusy(false);
    }
  }

  async function removeHero() {
    setRemoveHeroOpen(false);
    setHeroBusy(true);
    setHeroError(null);
    try {
      await setHero({ data: { phone, hero_image_url: null } });
      await load();
      refreshPublicStory();
    } catch (err) {
      setHeroError(err instanceof Error ? err.message : "تعذّر الحذف");
    } finally {
      setHeroBusy(false);
    }
  }

  async function handleSaveHeroText(e: React.FormEvent) {
    e.preventDefault();
    setHeroTextBusy(true);
    setHeroTextSaved(false);
    try {
      await saveHeroCopy({ data: { phone, ...heroForm } });
      setHeroTextSaved(true);
      refreshPublicStory();
    } catch (err) {
      alert(err instanceof Error ? err.message : "تعذّر الحفظ");
    } finally {
      setHeroTextBusy(false);
    }
  }

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function confirmDelete() {
    const id = deleteTarget;
    setDeleteTarget(null);
    if (!id) return;
    try {
      await removeImage({ data: { phone, id } });
      await load();
      refreshPublicStory();
    } catch (err) {
      alert(err instanceof Error ? err.message : "تعذّر الحذف");
    }
  }

  if (error) return <p className="py-10 text-center text-destructive">{error}</p>;
  if (!data) return <p className="py-10 text-center text-muted-foreground">جارِ التحميل...</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-card p-5 shadow-[var(--shadow-card)]">
        <h3 className="text-lg text-ink">صورة خلفية الواجهة</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          تظهر خلف اسم المتجر في أعلى الموقع، بطبقة وردية فوقها ليبقى النص واضحًا.
        </p>
        <div className="relative mt-4 h-40 overflow-hidden rounded-2xl bg-muted">
          {data.hero_image_url ? (
            <>
              <img
                src={data.hero_image_url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-primary/80" />
              <p className="absolute inset-0 flex items-center justify-center text-sm text-white">
                معاينة الخلفية
              </p>
            </>
          ) : (
            <div className="flex h-full items-center justify-center bg-primary text-sm text-primary-foreground">
              لا توجد صورة — تظهر الخلفية الوردية
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary">
            <span className="rounded-full border border-primary px-3 py-1.5">
              {heroBusy ? "جارِ الرفع..." : data.hero_image_url ? "تغيير الصورة" : "+ إضافة صورة"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleHeroFile}
              disabled={heroBusy}
            />
          </label>
          {data.hero_image_url && (
            <button
              type="button"
              onClick={() => setRemoveHeroOpen(true)}
              disabled={heroBusy}
              className="rounded-full border border-destructive px-3 py-1.5 text-sm text-destructive"
            >
              إزالة الصورة
            </button>
          )}
        </div>
        {heroError && <p className="mt-2 text-sm text-destructive">{heroError}</p>}
      </div>

      <form
        onSubmit={handleSaveHeroText}
        className="space-y-3 rounded-3xl bg-card p-5 shadow-[var(--shadow-card)]"
      >
        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">
            السطر الصغير فوق اسم المتجر
          </span>
          <input
            value={heroForm.hero_title}
            onChange={(e) => setHeroForm((f) => ({ ...f, hero_title: e.target.value }))}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">النص تحت اسم المتجر</span>
          <textarea
            rows={3}
            value={heroForm.hero_subtitle}
            onChange={(e) => setHeroForm((f) => ({ ...f, hero_subtitle: e.target.value }))}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={heroTextBusy}
            className="rounded-full px-6 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            style={{ backgroundImage: "var(--gradient-pink)" }}
          >
            {heroTextBusy ? "جارِ الحفظ..." : "حفظ النص"}
          </button>
          {heroTextSaved && <span className="text-sm text-primary">✓ تم الحفظ</span>}
        </div>
      </form>

      <form
        onSubmit={handleSave}
        className="space-y-3 rounded-3xl bg-card p-5 shadow-[var(--shadow-card)]"
      >
        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">العنوان الصغير</span>
          <input
            value={form.story_label}
            onChange={(e) => setForm((f) => ({ ...f, story_label: e.target.value }))}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">العنوان الرئيسي</span>
          <input
            value={form.story_title}
            onChange={(e) => setForm((f) => ({ ...f, story_title: e.target.value }))}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">الفقرة</span>
          <textarea
            rows={4}
            value={form.story_text}
            onChange={(e) => setForm((f) => ({ ...f, story_text: e.target.value }))}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full px-6 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            style={{ backgroundImage: "var(--gradient-pink)" }}
          >
            {busy ? "جارِ الحفظ..." : "حفظ النص"}
          </button>
          {saved && <span className="text-sm text-primary">✓ تم الحفظ</span>}
        </div>
      </form>

      <div className="rounded-3xl bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg text-ink">صور الإعلانات</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              تظهر في البطاقة المائلة أعلى الموقع وتتبدّل تلقائيًا.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary">
            <span className="rounded-full border border-primary px-3 py-1.5">
              {uploading ? "جارِ الرفع..." : "+ إضافة صورة"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={pickAdPhoto}
              disabled={uploading}
            />
          </label>
        </div>
        {uploadError && <p className="mt-2 text-sm text-destructive">{uploadError}</p>}

        <div className="scrollbar-none mt-4 flex gap-3 overflow-x-auto pb-2">
          {data.images.map((img) => (
            <div key={img.id} className="relative shrink-0">
              <img src={img.image_url} alt="" className="h-32 w-40 rounded-2xl object-cover" />
              <button
                onClick={() => setDeleteTarget(img.id)}
                className="absolute top-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink/70 text-sm text-white"
                aria-label="حذف الصورة"
              >
                ✕
              </button>
            </div>
          ))}
          {data.images.length === 0 && (
            <p className="py-6 text-sm text-muted-foreground">لا توجد صور بعد</p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="حذف هذه الصورة؟"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        open={removeHeroOpen}
        title="إزالة صورة الخلفية والعودة للخلفية الوردية؟"
        confirmLabel="إزالة"
        onConfirm={removeHero}
        onCancel={() => setRemoveHeroOpen(false)}
      />
      <CropDialog file={cropFile} onCancel={() => setCropFile(null)} onDone={handleCroppedAd} />
    </div>
  );
}
