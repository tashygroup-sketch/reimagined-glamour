import { useRef, useState } from "react";
import type { AdminDiscount, MenuItem, ProductVariant } from "@/lib/shop.functions";
import {
  hasValueStock,
  parseStock,
  totalFromValues,
  variableTotal,
  type StockVariable,
} from "@/lib/stock";
import { CropDialog, type CroppedImage } from "./CropDialog";
import { CategorySelect } from "./CategorySelect";

export type MenuItemDraft = {
  id?: string;
  name: string;
  description: string;
  price: string;
  // "" = no regular discount
  sale_price: string;
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
  min_qty: string;
  // "" = no discount. When a code is typed, the price and end time fields appear.
  discount_code: string;
  discount_price: string;
  // <input type="datetime-local"> value in the admin's own time zone; "" = no end time
  discount_ends: string;
};

// ISO time → "YYYY-MM-DDTHH:mm" in this browser's time zone, for datetime-local inputs.
function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// `uid` only lives in the form (stable React keys, and a photo that finishes uploading lands
// on the right value even if values were added or removed meanwhile). Not saved.
export type ValueDraft = { uid: string; label: string; image_url: string | null; stock: string };
export type VariableDraft = { uid: string; name: string; values: ValueDraft[] };

type CropTarget = "main" | "extra" | { value: string };

let uidCounter = 0;
const newUid = () => `u${++uidCounter}`;
const emptyValue = (): ValueDraft => ({ uid: newUid(), label: "", image_url: null, stock: "" });

// Form rows → what the stock rules in src/lib/stock.ts read (empty rows ignored).
export function draftToStockVariables(variables: VariableDraft[]): StockVariable[] {
  return variables
    .filter((v) => v.name.trim())
    .map((v) => ({
      name: v.name.trim(),
      values: v.values
        .filter((x) => x.label.trim())
        .map((x) => ({ label: x.label.trim(), stock: parseStock(x.stock) })),
    }))
    .filter((v) => v.values.length > 0);
}

const empty: MenuItemDraft = {
  name: "",
  description: "",
  price: "",
  sale_price: "",
  category: "",
  sort_order: "0",
  image_url: "",
  image_ratio: null,
  extra_images: [],
  extra_image_ratios: [],
  stock: "",
  variables: [],
  min_qty: "1",
  discount_code: "",
  discount_price: "",
  discount_ends: "",
};

function toDraftVariables(variables: ProductVariant[] | undefined): VariableDraft[] {
  return (variables ?? []).map((v) => ({
    uid: newUid(),
    name: v.name,
    values: v.values.map((x) => ({
      uid: newUid(),
      label: x.label,
      image_url: x.image_url,
      stock: x.stock === null || x.stock === undefined ? "" : String(x.stock),
    })),
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
  initialDiscount,
  categories,
  busy,
  onCancel,
  onSubmit,
  onUploadImage,
  nextSortOrderFor,
}: {
  initial?: MenuItem | null;
  initialDiscount?: AdminDiscount | null;
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
          sale_price:
            initial.sale_price !== null && initial.sale_price !== undefined
              ? String(initial.sale_price)
              : "",
          category: initial.category,
          sort_order: String(initial.sort_order),
          image_url: initial.image_url ?? "",
          image_ratio: initial.image_ratio ?? null,
          extra_images: initial.extra_images ?? [],
          extra_image_ratios: initial.extra_image_ratios ?? [],
          stock: initial.stock === null || initial.stock === undefined ? "" : String(initial.stock),
          variables: toDraftVariables(initial.variables),
          min_qty: String(initial.min_qty ?? 1),
          discount_code: initialDiscount?.code ?? "",
          discount_price: initialDiscount ? String(initialDiscount.discount_price) : "",
          discount_ends: toLocalInput(initialDiscount?.ends_at),
        }
      : empty,
  );
  const [variablesError, setVariablesError] = useState<string | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  // Photos upload in the background, several at once; each shows its own "..." until done.
  const [uploadingValues, setUploadingValues] = useState<string[]>([]);
  const [pendingExtras, setPendingExtras] = useState(0);
  const [addingCategory, setAddingCategory] = useState(categories.length === 0);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryMissing, setCategoryMissing] = useState(false);
  // Our own copy of the options, so a category created here shows as selected immediately.
  const [availableCategories, setAvailableCategories] = useState(categories);
  const [uploadingMain, setUploadingMain] = useState(false);
  // true while a main photo is on its way (read inside uploads that finish later)
  const mainOnItsWay = useRef(false);
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

  // The crop screen closes right away; the upload carries on in the background, so the next
  // photo can be picked while this one is still uploading.
  function handleCropped(image: CroppedImage) {
    const target = pendingCrop?.target ?? "main";
    setPendingCrop(null);
    setUploadError(null);
    if (typeof target === "object") void uploadValueImage(target.value, image);
    else if (target === "main") void uploadMain(image);
    else void uploadExtra(image);
  }

  function failed(err: unknown) {
    setUploadError(err instanceof Error ? err.message : "تعذّر رفع الصورة");
  }

  async function uploadMain(image: CroppedImage) {
    setUploadingMain(true);
    mainOnItsWay.current = true;
    try {
      const { url, ratio } = await onUploadImage(image);
      setDraft((d) => ({ ...d, image_url: url, image_ratio: ratio }));
    } catch (err) {
      failed(err);
    } finally {
      mainOnItsWay.current = false;
      setUploadingMain(false);
    }
  }

  async function uploadExtra(image: CroppedImage) {
    setPendingExtras((n) => n + 1);
    try {
      const { url, ratio } = await onUploadImage(image);
      setDraft((d) =>
        // No main photo yet: the first photo added with «+ صورة» becomes the main one —
        // it's the one shown on the product's card, so the card is never left empty.
        !d.image_url && !mainOnItsWay.current
          ? { ...d, image_url: url, image_ratio: ratio }
          : {
              ...d,
              extra_images: [...d.extra_images, url],
              extra_image_ratios: [...d.extra_image_ratios, ratio ?? 4 / 3],
            },
      );
    } catch (err) {
      failed(err);
    } finally {
      setPendingExtras((n) => n - 1);
    }
  }

  async function uploadValueImage(valueUid: string, image: CroppedImage) {
    setUploadingValues((ids) => [...ids, valueUid]);
    try {
      const { url } = await onUploadImage(image);
      // by uid: lands on the right value even if rows were added/removed meanwhile (and is
      // simply dropped if that value was deleted)
      updateValue(valueUid, { image_url: url });
    } catch (err) {
      failed(err);
    } finally {
      setUploadingValues((ids) => ids.filter((x) => x !== valueUid));
    }
  }

  function setVariables(update: (vars: VariableDraft[]) => VariableDraft[]) {
    setVariablesError(null);
    setDraft((d) => ({ ...d, variables: update(d.variables) }));
  }

  function updateValue(valueUid: string, patch: Partial<ValueDraft>) {
    setVariables((vars) =>
      vars.map((v) =>
        v.values.some((x) => x.uid === valueUid)
          ? { ...v, values: v.values.map((x) => (x.uid === valueUid ? { ...x, ...patch } : x)) }
          : v,
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

  const uploading = uploadingMain || pendingExtras > 0 || uploadingValues.length > 0;
  const stockNumber = draft.stock === "" ? null : Number(draft.stock);
  const stockVars = draftToStockVariables(draft.variables);
  // Any value with a quantity → the product's total is calculated from the values.
  const perValue = hasValueStock(stockVars);
  const perValueTotal = totalFromValues(stockVars);

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
        const sale = draft.sale_price.trim() ? Number(draft.sale_price) : null;
        if (sale !== null && (!Number.isFinite(sale) || sale < 0 || sale >= Number(draft.price))) {
          setPriceError("السعر بعد الخصم يجب أن يكون أقل من السعر الأصلي");
          return;
        }
        if (draft.discount_code.trim()) {
          const dp = Number(draft.discount_price);
          if (draft.discount_price.trim() === "" || !Number.isFinite(dp) || dp < 0) {
            setDiscountError("اكتبي السعر مع الكود");
            return;
          }
          if (dp >= (sale ?? Number(draft.price))) {
            setDiscountError("السعر مع الكود يجب أن يكون أقل من سعر المنتج الحالي");
            return;
          }
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
          onChange={(v) => {
            setPriceError(null);
            setDraft((d) => ({ ...d, price: v }));
          }}
        />
        <Field
          label="السعر بعد الخصم (اختياري)"
          type="number"
          step="0.01"
          value={draft.sale_price}
          onChange={(v) => {
            setPriceError(null);
            setDraft((d) => ({ ...d, sale_price: v }));
          }}
        />
        <p className="-mt-1 text-xs leading-5 text-muted-foreground sm:col-span-2">
          {priceError ? (
            <span className="text-destructive">{priceError}</span>
          ) : draft.sale_price.trim() && Number(draft.sale_price) < Number(draft.price) ? (
            `يرى الجميع ${draft.price} مشطوبًا والسعر ${draft.sale_price} د.ل (خصم ${Math.round((1 - Number(draft.sale_price) / Number(draft.price)) * 100)}%) بدون كود`
          ) : (
            "اتركيه فارغًا إذا لا يوجد خصم"
          )}
        </p>

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

        {perValue ? (
          <div>
            <span className="mb-1 block text-sm text-muted-foreground">الكمية الإجمالية</span>
            <div
              className={`flex h-12 items-center justify-center rounded-2xl border bg-muted text-lg font-bold ${
                perValueTotal === 0
                  ? "border-destructive text-destructive"
                  : "border-border text-ink"
              }`}
            >
              {perValueTotal === null ? "غير محدودة" : perValueTotal === 0 ? "نفذت" : perValueTotal}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              تُحسب من كميات القيم:{" "}
              {stockVars
                .map((v) => {
                  const t = variableTotal(v);
                  return `${v.name} ${t === null ? "غير محدود" : t}`;
                })
                .join(" · ")}
              {stockVars.length > 1 && " — الإجمالي هو الأقل، لأن كل قطعة تُطلب بقيمة من كل متغير"}
            </p>
          </div>
        ) : (
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
                  stockNumber === 0
                    ? "border-destructive text-destructive"
                    : "border-border text-ink"
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
            {draft.variables.length > 0 && (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                أو اكتبي كمية لكل قيمة في المتغيرات بالأسفل
              </p>
            )}
          </div>
        )}

        <div>
          <span className="mb-1 block text-sm text-muted-foreground">أقل كمية يمكن طلبها</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setDraft((d) => ({ ...d, min_qty: String(Math.max(1, Number(d.min_qty) - 1)) }))
              }
              disabled={Number(draft.min_qty) <= 1}
              aria-label="إنقاص أقل كمية"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-xl text-ink transition-opacity disabled:opacity-40"
            >
              −
            </button>
            <input
              inputMode="numeric"
              dir="ltr"
              value={draft.min_qty}
              onChange={(e) => setDraft((d) => ({ ...d, min_qty: toDigits(e.target.value) }))}
              onBlur={() =>
                setDraft((d) => ({ ...d, min_qty: String(Math.max(1, Number(d.min_qty) || 1)) }))
              }
              aria-label="أقل كمية يمكن طلبها"
              className="h-12 w-full min-w-0 rounded-2xl border border-border bg-background px-2 text-center text-lg text-ink outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() =>
                setDraft((d) => ({ ...d, min_qty: String((Number(d.min_qty) || 1) + 1) }))
              }
              aria-label="زيادة أقل كمية"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl text-primary-foreground"
              style={{ backgroundImage: "var(--gradient-pink)" }}
            >
              +
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {Number(draft.min_qty) > 1
              ? `لن تستطيع الزبونة طلب أقل من ${draft.min_qty} من هذا المنتج`
              : "1 = بدون حد أدنى"}
          </p>
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
        <label className="block">
          <span className="text-sm font-bold text-ink">كود الخصم (اختياري)</span>
          <input
            dir="auto"
            value={draft.discount_code}
            placeholder="مثال: JANNAT10"
            onChange={(e) => {
              setDiscountError(null);
              setDraft((d) => ({ ...d, discount_code: e.target.value }));
            }}
            className="mt-1 w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
          />
        </label>
        {draft.discount_code.trim() ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-muted-foreground">السعر مع الكود (د.ل)</span>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                dir="ltr"
                value={draft.discount_price}
                onChange={(e) => {
                  setDiscountError(null);
                  setDraft((d) => ({ ...d, discount_price: e.target.value }));
                }}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-muted-foreground">ينتهي الخصم في</span>
              <input
                type="datetime-local"
                dir="ltr"
                value={draft.discount_ends}
                onChange={(e) => setDraft((d) => ({ ...d, discount_ends: e.target.value }))}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {draft.discount_ends && new Date(draft.discount_ends).getTime() <= Date.now()
                  ? "هذا الوقت مضى — الخصم منتهٍ ولن يظهر للزبائن"
                  : draft.discount_ends
                    ? "بعد هذا الوقت يختفي الخصم تلقائيًا"
                    : "اتركيه فارغًا ليبقى الخصم بدون وقت انتهاء"}
              </span>
            </label>
            <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">
              يظهر للزبونة حقل «كود خصم» في صفحة هذا المنتج، وعند كتابة نفس الكود يظهر سعر الخصم.
            </p>
          </div>
        ) : null}
        {discountError && <p className="mt-2 text-sm text-destructive">{discountError}</p>}
      </div>

      <div className="rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-ink">المتغيرات</span>
          <button
            type="button"
            onClick={() =>
              setVariables((vars) => [...vars, { uid: newUid(), name: "", values: [emptyValue()] }])
            }
            className="rounded-full border border-primary px-3 py-1.5 text-xs font-medium text-primary"
          >
            + إضافة متغير
          </button>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          مثل اللون أو المقاس. إذا أضفتِ متغيرًا، يجب على الزبونة اختيار قيمة منه قبل الطلب. الكمية
          لكل قيمة اختيارية: فارغة = غير محدودة، 0 = نفذت (تظهر رمادية للزبونة حتى تزيديها).
        </p>

        {draft.variables.map((v) => {
          const counted = stockVars.find((x) => x.name === v.name.trim());
          const total = counted ? variableTotal(counted) : null;
          const someCounted = counted?.values.some((x) => x.stock !== null) ?? false;
          return (
            <div key={v.uid} className="mt-3 rounded-2xl bg-muted/70 p-3">
              <div className="flex gap-2">
                <input
                  value={v.name}
                  placeholder="اسم المتغير، مثال: اللون"
                  onChange={(e) =>
                    setVariables((vars) =>
                      vars.map((x) => (x.uid === v.uid ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  className="w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setVariables((vars) => vars.filter((x) => x.uid !== v.uid))}
                  className="shrink-0 rounded-xl border border-destructive px-3 text-xs text-destructive"
                >
                  حذف المتغير
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2 px-0.5 text-[11px] text-muted-foreground">
                <span className="w-12 shrink-0 text-center">الصورة</span>
                <span className="min-w-0 flex-1">القيمة</span>
                <span className="w-16 shrink-0 text-center">الكمية</span>
                <span className="w-9 shrink-0" />
              </div>
              <div className="mt-1 space-y-2">
                {v.values.map((val) => {
                  const busyHere = uploadingValues.includes(val.uid);
                  const soldOut = val.stock !== "" && Number(val.stock) === 0;
                  return (
                    <div key={val.uid} className="flex items-center gap-2">
                      <div className="relative h-12 w-12 shrink-0">
                        {/* The file input sits inside the tile (visually hidden, not display:none)
                            so tapping the tile opens the photo picker reliably on iPhone. */}
                        <label
                          className="relative flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-primary/60 bg-background text-[10px] text-primary"
                          title="صورة القيمة"
                        >
                          {val.image_url ? (
                            <img
                              src={val.image_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            !busyHere && "+ صورة"
                          )}
                          {busyHere && (
                            <span className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs text-primary">
                              ...
                            </span>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            disabled={busyHere}
                            onChange={pickFile({ value: val.uid })}
                          />
                        </label>
                        {val.image_url && !busyHere && (
                          <button
                            type="button"
                            onClick={() => updateValue(val.uid, { image_url: null })}
                            aria-label="إزالة صورة القيمة"
                            className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink/80 text-[10px] text-white"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <input
                        value={val.label}
                        placeholder="مثال: أحمر"
                        onChange={(e) => updateValue(val.uid, { label: e.target.value })}
                        className="w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-primary"
                      />
                      <input
                        inputMode="numeric"
                        dir="ltr"
                        value={val.stock}
                        placeholder="∞"
                        aria-label={`كمية ${val.label || "القيمة"}`}
                        onChange={(e) => updateValue(val.uid, { stock: toDigits(e.target.value) })}
                        className={`w-16 shrink-0 rounded-xl border bg-background px-1 py-2.5 text-center text-base outline-none placeholder:text-muted-foreground focus:border-primary ${
                          soldOut ? "border-destructive text-destructive" : "border-border text-ink"
                        }`}
                      />
                      <button
                        type="button"
                        aria-label="حذف القيمة"
                        onClick={() =>
                          setVariables((vars) =>
                            vars.map((x) =>
                              x.uid === v.uid
                                ? { ...x, values: x.values.filter((y) => y.uid !== val.uid) }
                                : x,
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
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setVariables((vars) =>
                      vars.map((x) =>
                        x.uid === v.uid ? { ...x, values: [...x.values, emptyValue()] } : x,
                      ),
                    )
                  }
                  className="text-sm font-medium text-primary"
                >
                  + إضافة قيمة
                </button>
                {someCounted && (
                  <span className="text-xs text-muted-foreground">
                    {total === null
                      ? "بعض القيم بدون كمية (غير محدودة)"
                      : `مجموع ${v.name.trim() || "المتغير"}: ${total}`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {variablesError && <p className="mt-2 text-sm text-destructive">{variablesError}</p>}
      </div>

      <div>
        {/* main photo first, extra photos beside it, then the add-extra tile */}
        <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
          {draft.image_url ? (
            <div className="relative h-24 w-[72px] shrink-0">
              <img
                src={draft.image_url}
                alt=""
                className="h-full w-full rounded-xl border-2 border-primary object-cover"
              />
              <span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-primary py-0.5 text-center text-[10px] font-bold text-primary-foreground">
                الصورة الرئيسية
              </span>
            </div>
          ) : (
            <div className="flex h-24 w-[72px] shrink-0 items-center justify-center rounded-xl border-2 border-primary/40 bg-muted text-center text-[11px] text-muted-foreground">
              {uploadingMain ? "..." : "بدون صورة"}
            </div>
          )}
          {draft.extra_images.map((url, idx) => (
            <div key={`${url}-${idx}`} className="relative h-24 w-[72px] shrink-0">
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
          {Array.from({ length: pendingExtras }, (_, i) => (
            <div
              key={`pending-${i}`}
              className="flex h-24 w-[72px] shrink-0 items-center justify-center rounded-xl bg-muted text-xs text-primary"
            >
              ...
            </div>
          ))}
          <label className="relative flex h-24 w-[72px] shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed border-primary/60 text-xs text-primary">
            + صورة
            <input type="file" accept="image/*" className="sr-only" onChange={pickFile("extra")} />
          </label>
        </div>

        <label className="relative mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary">
          <span className="rounded-full border border-primary px-3 py-1.5">
            {uploadingMain
              ? "جارِ الرفع..."
              : draft.image_url
                ? "📷 تغيير الصورة الرئيسية"
                : "📷 اختيار الصورة الرئيسية"}
          </span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={pickFile("main")}
            disabled={uploadingMain}
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
          {busy ? "جارِ الحفظ..." : uploading ? "جارِ رفع الصور..." : "حفظ"}
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
