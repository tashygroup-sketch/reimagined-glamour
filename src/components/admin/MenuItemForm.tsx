import { useState } from "react";
import type { MenuItem, ProductVariant } from "@/lib/shop.functions";
import { CropDialog, type CroppedImage } from "./CropDialog";
import { CategorySelect } from "./CategorySelect";

export type MenuItemDraft = {
  id?: string;
  name: string;
  description: string;
  price: string;
  category: string;
  // Set automatically: end of the chosen category (not shown to the admin).
  sort_order: string;
  image_url: string;
  image_ratio: number | null;
  extra_images: string[];
  extra_image_ratios: number[];
  // "" = not tracked (unlimited)
  stock: string;
  variables: VariableDraft[];
};

export type VariableDraft = {
  name: string;
  values: { label: string; image_url: string | null }[];
};

type CropTarget = "main" | "extra" | { variable: number; value: number };

const empty: MenuItemDraft = {
  name: "",
  description: "",
  price: "",
  category: "",
  sort_order: "0",
  image_url: "",
  image_ratio: null,
  extra_images: [],
  extra_image_ratios: [],
  stock: "",
  variables: [],
};

function toDraftVariables(variables: ProductVariant[] | undefined): VariableDraft[] {
  return (variables ?? []).map((v) => ({
    name: v.name,
    values: v.values.map((x) => ({ label: x.label, image_url: x.image_url })),
  }));
}

// Mirrors the server's rules so mistakes show up before saving.
function checkVariables(variables: VariableDraft[]): string | null {
  const names = new Set<string>();
  for (const v of variables) {
    const name = v.name.trim();
    const labels = v.values.map((x) => x.label.trim()).filter(Boolean);
    if (!name && labels.length === 0) continue;
    if (!name) return "اكتبي اسم المتغير (مثل: اللون)";
    if (labels.length === 0) return `أضيفي قيمة واحدة على الأقل للمتغير "${name}"`;
    if (names.has(name)) return `اسم المتغير "${name}" مكرر`;
    names.add(name);
    const dup = labels.find((l, i) => labels.indexOf(l) !== i);
    if (dup) return `القيمة "${dup}" مكررة في "${name}"`;
  }
  return null;
}

// Phone keyboards set to Arabic type ٠١٢٣٤٥٦٧٨٩ (or ۰۱۲...); convert them to 0-9 and drop
// anything that isn't a digit.
function toDigits(raw: string) {
  return raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "");
}

export function MenuItemForm({
  initial,
  categories,
  busy,
  onCancel,
  onSubmit,
  onUploadImage,
  nextSortOrderFor,
}: {
  initial?: MenuItem | null;
  categories: string[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (draft: MenuItemDraft) => void;
  onUploadImage: (image: CroppedImage) => Promise<{ url: string; ratio: number | null }>;
  nextSortOrderFor: (category: string) => number;
}) {
  const [draft, setDraft] = useState<MenuItemDraft>(
    initial
      ? {
          id: initial.id,
          name: initial.name,
          description: initial.description ?? "",
          price: String(initial.price),
          category: initial.category,
          sort_order: String(initial.sort_order),
          image_url: initial.image_url ?? "",
          image_ratio: initial.image_ratio ?? null,
          extra_images: initial.extra_images ?? [],
          extra_image_ratios: initial.extra_image_ratios ?? [],
          stock: initial.stock === null || initial.stock === undefined ? "" : String(initial.stock),
          variables: toDraftVariables(initial.variables),
        }
      : empty,
  );
  const [variablesError, setVariablesError] = useState<string | null>(null);
  const [uploadingValue, setUploadingValue] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(categories.length === 0);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryMissing, setCategoryMissing] = useState(false);
  // Our own copy of the options, so a category created here shows as selected immediately.
  const [availableCategories, setAvailableCategories] = useState(categories);
  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingExtra, setUploadingExtra] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingCrop, setPendingCrop] = useState<{ file: File; target: CropTarget } | null>(null);

  // The display order is no longer a field: keep an item's place if it stays in its original
  // category, otherwise put it at the end of the category it's moved into.
  function sortOrderFor(category: string) {
    return initial && category === initial.category
      ? String(initial.sort_order)
      : String(nextSortOrderFor(category));
  }

  function chooseCategory(value: string) {
    setCategoryMissing(false);
    setDraft((d) => ({ ...d, category: value, sort_order: sortOrderFor(value) }));
  }

  function confirmNewCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setAvailableCategories((prev) => (prev.includes(name) ? prev : [...prev, name]));
    chooseCategory(name);
    setAddingCategory(false);
    setNewCategoryName("");
  }

  function stepStock(delta: number) {
    setDraft((d) => {
      if (d.stock === "") return delta > 0 ? { ...d, stock: "1" } : d;
      return { ...d, stock: String(Math.max(0, Number(d.stock) + delta)) };
    });
  }

  function pickFile(target: CropTarget) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) setPendingCrop({ file, target });
    };
  }

  async function handleCropped(image: CroppedImage) {
    const target = pendingCrop?.target ?? "main";
    setPendingCrop(null);
    if (typeof target === "object") {
      await uploadValueImage(target, image);
      return;
    }
    const setUploading = target === "main" ? setUploadingMain : setUploadingExtra;
    setUploading(true);
    setUploadError(null);
    try {
      const { url, ratio } = await onUploadImage(image);
      setDraft((d) =>
        target === "main"
          ? { ...d, image_url: url, image_ratio: ratio }
          : {
              ...d,
              extra_images: [...d.extra_images, url],
              extra_image_ratios: [...d.extra_image_ratios, ratio ?? 4 / 3],
            },
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "تعذّر رفع الصورة");
    } finally {
      setUploading(false);
    }
  }

  async function uploadValueImage(
    target: { variable: number; value: number },
    image: CroppedImage,
  ) {
    const id = `${target.variable}-${target.value}`;
    setUploadingValue(id);
    setUploadError(null);
    try {
      const { url } = await onUploadImage(image);
      updateValue(target.variable, target.value, { image_url: url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "تعذّر رفع الصورة");
    } finally {
      setUploadingValue(null);
    }
  }

  function setVariables(update: (vars: VariableDraft[]) => VariableDraft[]) {
    setVariablesError(null);
    setDraft((d) => ({ ...d, variables: update(d.variables) }));
  }

  function updateValue(vi: number, i: number, patch: Partial<VariableDraft["values"][number]>) {
    setVariables((vars) =>
      vars.map((v, idx) =>
        idx !== vi
          ? v
          : { ...v, values: v.values.map((x, j) => (j === i ? { ...x, ...patch } : x)) },
      ),
    );
  }

  function removeExtraImage(index: number) {
    setDraft((d) => ({
      ...d,
      extra_images: d.extra_images.filter((_, i) => i !== index),
      extra_image_ratios: d.extra_image_ratios.filter((_, i) => i !== index),
    }));
  }

  const uploading = uploadingMain || uploadingExtra || uploadingValue !== null;
  const stockNumber = draft.stock === "" ? null : Number(draft.stock);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.category) {
          setCategoryMissing(true);
          return;
        }
        const problem = checkVariables(draft.variables);
        if (problem) {
          setVariablesError(problem);
          return;
        }
        onSubmit(draft);
      }}
      className="space-y-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-card)]"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="اسم الصنف"
          required
          value={draft.name}
          onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
        />
        <Field
          label="السعر (د.ل)"
          required
          type="number"
          step="0.01"
          value={draft.price}
          onChange={(v) => setDraft((d) => ({ ...d, price: v }))}
        />

        {/* div, not label: a label forwards taps to the first button inside it */}
        <div>
          <span className="mb-1 block text-sm text-muted-foreground">التصنيف</span>
          {addingCategory ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmNewCategory();
                  }
                }}
                placeholder="اسم التصنيف الجديد"
                className="w-full min-w-0 rounded-2xl border border-primary bg-background px-4 py-3 outline-none"
              />
              <button
                type="button"
                onClick={confirmNewCategory}
                className="shrink-0 rounded-2xl px-4 text-sm font-medium text-primary-foreground"
                style={{ backgroundImage: "var(--gradient-pink)" }}
              >
                إضافة
              </button>
              {availableCategories.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setAddingCategory(false);
                    setNewCategoryName("");
                  }}
                  className="shrink-0 rounded-2xl border border-border px-3 text-sm text-ink"
                >
                  إلغاء
                </button>
              )}
            </div>
          ) : (
            <CategorySelect
              value={draft.category}
              options={availableCategories}
              onChange={chooseCategory}
              onAddNew={() => setAddingCategory(true)}
              invalid={categoryMissing}
            />
          )}
          {categoryMissing && <p className="mt-1 text-xs text-destructive">اختاري تصنيفًا</p>}
        </div>

        <div>
          <span className="mb-1 block text-sm text-muted-foreground">الكمية المتوفرة</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => stepStock(-1)}
              disabled={stockNumber === null || stockNumber <= 0}
              aria-label="إنقاص الكمية"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-xl text-ink transition-opacity disabled:opacity-40"
            >
              −
            </button>
            <input
              inputMode="numeric"
              dir="ltr"
              value={draft.stock}
              placeholder="غير محدودة"
              onChange={(e) => setDraft((d) => ({ ...d, stock: toDigits(e.target.value) }))}
              aria-label="الكمية المتوفرة"
              className={`h-12 w-full min-w-0 rounded-2xl border bg-background px-2 text-center text-lg outline-none placeholder:text-sm placeholder:text-muted-foreground focus:border-primary ${
                stockNumber === 0 ? "border-destructive text-destructive" : "border-border text-ink"
              }`}
            />
            <button
              type="button"
              onClick={() => stepStock(1)}
              aria-label="زيادة الكمية"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl text-primary-foreground"
              style={{ backgroundImage: "var(--gradient-pink)" }}
            >
              +
            </button>
          </div>
          {stockNumber !== null && (
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, stock: "" }))}
              className="mt-1 text-xs text-muted-foreground underline"
            >
              جعلها غير محدودة
            </button>
          )}
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm text-muted-foreground">الوصف</span>
        <textarea
          rows={2}
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
        />
      </label>

      <div className="rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-ink">المتغيرات</span>
          <button
            type="button"
            onClick={() =>
              setVariables((vars) => [
                ...vars,
                { name: "", values: [{ label: "", image_url: null }] },
              ])
            }
            className="rounded-full border border-primary px-3 py-1.5 text-xs font-medium text-primary"
          >
            + إضافة متغير
          </button>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          مثل اللون أو المقاس. إذا أضفتِ متغيرًا، يجب على الزبونة اختيار قيمة منه قبل الطلب.
        </p>

        {draft.variables.map((v, vi) => (
          <div key={vi} className="mt-3 rounded-2xl bg-muted/70 p-3">
            <div className="flex gap-2">
              <input
                value={v.name}
                placeholder="اسم المتغير، مثال: اللون"
                onChange={(e) =>
                  setVariables((vars) =>
                    vars.map((x, idx) => (idx === vi ? { ...x, name: e.target.value } : x)),
                  )
                }
                className="w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setVariables((vars) => vars.filter((_, idx) => idx !== vi))}
                className="shrink-0 rounded-xl border border-destructive px-3 text-xs text-destructive"
              >
                حذف المتغير
              </button>
            </div>

            <div className="mt-2 space-y-2">
              {v.values.map((val, i) => {
                const busyHere = uploadingValue === `${vi}-${i}`;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <label
                      className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-primary/60 bg-background text-[10px] text-primary"
                      title="صورة القيمة"
                    >
                      {val.image_url ? (
                        <img src={val.image_url} alt="" className="h-full w-full object-cover" />
                      ) : busyHere ? (
                        "..."
                      ) : (
                        "+ صورة"
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploading}
                        onChange={pickFile({ variable: vi, value: i })}
                      />
                    </label>
                    <input
                      value={val.label}
                      placeholder="القيمة، مثال: أحمر"
                      onChange={(e) => updateValue(vi, i, { label: e.target.value })}
                      className="w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                    />
                    {val.image_url && (
                      <button
                        type="button"
                        onClick={() => updateValue(vi, i, { image_url: null })}
                        className="shrink-0 text-[11px] text-muted-foreground underline"
                      >
                        إزالة الصورة
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="حذف القيمة"
                      onClick={() =>
                        setVariables((vars) =>
                          vars.map((x, idx) =>
                            idx === vi ? { ...x, values: x.values.filter((_, j) => j !== i) } : x,
                          ),
                        )
                      }
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-destructive"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() =>
                setVariables((vars) =>
                  vars.map((x, idx) =>
                    idx === vi
                      ? { ...x, values: [...x.values, { label: "", image_url: null }] }
                      : x,
                  ),
                )
              }
              className="mt-2 text-sm font-medium text-primary"
            >
              + إضافة قيمة
            </button>
          </div>
        ))}
        {variablesError && <p className="mt-2 text-sm text-destructive">{variablesError}</p>}
      </div>

      <div>
        {/* main photo first, extra photos beside it, then the add-extra tile */}
        <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
          {draft.image_url ? (
            <img
              src={draft.image_url}
              alt=""
              className="h-24 w-[72px] shrink-0 rounded-xl border-2 border-primary object-cover"
            />
          ) : (
            <div className="flex h-24 w-[72px] shrink-0 items-center justify-center rounded-xl border-2 border-primary/40 bg-muted text-center text-[11px] text-muted-foreground">
              {uploadingMain ? "..." : "بدون صورة"}
            </div>
          )}
          {draft.extra_images.map((url, idx) => (
            <div key={url} className="relative h-24 w-[72px] shrink-0">
              <img src={url} alt="" className="h-full w-full rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => removeExtraImage(idx)}
                className="absolute top-1 left-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-xs text-white"
                aria-label="إزالة الصورة"
              >
                ✕
              </button>
            </div>
          ))}
          <label className="flex h-24 w-[72px] shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed border-primary/60 text-xs text-primary">
            {uploadingExtra ? "..." : "+ صورة"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={pickFile("extra")}
              disabled={uploading}
            />
          </label>
        </div>

        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary">
          <span className="rounded-full border border-primary px-3 py-1.5">
            {uploadingMain ? "جارِ الرفع..." : "📷 اختيار صورة من المعرض"}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={pickFile("main")}
            disabled={uploading}
          />
        </label>
        {uploadError && <p className="mt-1 text-sm text-destructive">{uploadError}</p>}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={busy || uploading || addingCategory}
          className="rounded-full px-6 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          style={{ backgroundImage: "var(--gradient-pink)" }}
        >
          {busy ? "جارِ الحفظ..." : "حفظ"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-border px-6 py-2.5 text-sm text-ink"
        >
          إلغاء
        </button>
      </div>

      <CropDialog
        file={pendingCrop?.file ?? null}
        onCancel={() => setPendingCrop(null)}
        onDone={handleCropped}
      />
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted-foreground">{label}</span>
      <input
        type={type}
        step={step}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
      />
    </label>
  );
}
