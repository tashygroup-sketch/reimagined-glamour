import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  getMenu,
  getCategories,
  getDiscountsAdmin,
  saveCategoryImage,
  saveMenuItem,
  deleteMenuItem,
  uploadMenuImage,
  type AdminDiscount,
  type CategoryInfo,
  type MenuItem,
} from "@/lib/shop.functions";
import { SQUARE_CROP, withUploadRetry } from "@/lib/image";
import { parseStock } from "@/lib/stock";
import { useCloseLayer, withLayer } from "@/lib/back-layer";
import { CropDialog, type CroppedImage } from "./CropDialog";
import { MenuItemForm, type MenuItemDraft } from "./MenuItemForm";
import { Reveal } from "@/components/Reveal";
import { ConfirmDialog } from "./ConfirmDialog";

export function MenuPanel({ phone }: { phone: string }) {
  const fetchMenu = useServerFn(getMenu);
  const save = useServerFn(saveMenuItem);
  const remove = useServerFn(deleteMenuItem);
  const upload = useServerFn(uploadMenuImage);
  const fetchCategories = useServerFn(getCategories);
  const setCategoryImage = useServerFn(saveCategoryImage);
  const fetchDiscounts = useServerFn(getDiscountsAdmin);
  const queryClient = useQueryClient();

  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [categoryInfo, setCategoryInfo] = useState<CategoryInfo[]>([]);
  const [discounts, setDiscounts] = useState<AdminDiscount[]>([]);
  const [categoryCrop, setCategoryCrop] = useState<{ file: File; name: string } | null>(null);
  const [categoryBusy, setCategoryBusy] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The open form lives in the URL (?edit=<id> or ?edit=new) with its own history entry, so
  // the phone's back button closes the form instead of leaving the control panel.
  const { edit } = useSearch({ from: "/admin" });
  const navigate = useNavigate({ from: "/admin" });
  const closeLayer = useCloseLayer();
  const editing: MenuItem | "new" | null =
    edit === "new" ? "new" : edit ? ((items ?? []).find((i) => i.id === edit) ?? null) : null;

  function openEditor(id: string) {
    void navigate({
      search: (prev) => ({ ...prev, edit: id }),
      state: (prev) => withLayer(prev),
      resetScroll: false,
    });
  }

  function closeEditor() {
    closeLayer(() =>
      navigate({
        search: ({ edit: _edit, ...rest }) => rest,
        replace: true,
        resetScroll: false,
      }),
    );
  }

  async function load() {
    try {
      const [rows, cats, codes] = await Promise.all([
        fetchMenu(),
        fetchCategories(),
        fetchDiscounts({ data: { phone } }).catch(() => [] as AdminDiscount[]),
      ]);
      setItems(rows);
      setCategoryInfo(cats);
      setDiscounts(codes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل المنيو");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = [...new Set((items ?? []).map((i) => i.category))];

  function nextSortOrderFor(category: string) {
    const inCategory = (items ?? []).filter((i) => i.category === category);
    if (inCategory.length === 0) return 1;
    return Math.max(...inCategory.map((i) => i.sort_order)) + 1;
  }

  const categoryImage = (name: string) =>
    categoryInfo.find((c) => c.name === name)?.image_url ?? null;

  // Category photo arrives already cropped square by the crop screen.
  async function handleCategoryCropped(image: CroppedImage) {
    const target = categoryCrop?.name;
    setCategoryCrop(null);
    if (!target) return;
    await changeCategoryImage(target, image);
  }

  async function changeCategoryImage(name: string, image: CroppedImage | null) {
    setCategoryBusy(name);
    setCategoryError(null);
    try {
      let url: string | null = null;
      if (image) {
        const res = await withUploadRetry(() =>
          upload({
            data: {
              phone,
              filename: image.filename,
              contentType: image.contentType,
              dataBase64: image.base64,
            },
          }),
        );
        url = res.url;
      }
      await setCategoryImage({ data: { phone, name, image_url: url } });
      setCategoryInfo(await fetchCategories());
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : "تعذّر حفظ صورة التصنيف");
    } finally {
      setCategoryBusy(null);
    }
  }

  // The photo arrives already cropped to 960×1280 by the crop screen.
  async function handleUploadImage(image: CroppedImage) {
    const res = await withUploadRetry(() =>
      upload({
        data: {
          phone,
          filename: image.filename,
          contentType: image.contentType,
          dataBase64: image.base64,
        },
      }),
    );
    return { url: res.url, ratio: res.ratio };
  }

  async function handleSubmit(draft: MenuItemDraft) {
    setBusy(true);
    try {
      await save({
        data: {
          phone,
          item: {
            ...(draft.id ? { id: draft.id } : {}),
            name: draft.name,
            description: draft.description,
            price: Number(draft.price) || 0,
            sale_price: draft.sale_price.trim() ? Number(draft.sale_price) : null,
            image_url: draft.image_url,
            image_ratio: draft.image_ratio,
            extra_images: draft.extra_images,
            extra_image_ratios: draft.extra_image_ratios,
            category: draft.category || "مكياج",
            sort_order: Number(draft.sort_order) || 0,
            stock: draft.stock.trim() === "" ? null : Math.max(0, Math.floor(Number(draft.stock))),
            variables: draft.variables.map((v) => ({
              name: v.name,
              values: v.values
                .filter((x) => x.label.trim())
                .map((x) => ({
                  label: x.label,
                  image_url: x.image_url,
                  stock: parseStock(x.stock),
                })),
            })),
            min_qty: Math.max(1, Math.floor(Number(draft.min_qty) || 1)),
            discount: draft.discount_code.trim()
              ? {
                  code: draft.discount_code.trim(),
                  discount_price: Number(draft.discount_price),
                  // datetime-local is the admin's local time; toISOString stores it exactly
                  ends_at: draft.discount_ends ? new Date(draft.discount_ends).toISOString() : null,
                }
              : null,
          },
        },
      });
      closeEditor();
      await load();
      queryClient.invalidateQueries({ queryKey: ["menu"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  }

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function confirmDelete() {
    const id = deleteTarget;
    setDeleteTarget(null);
    if (!id) return;
    try {
      await remove({ data: { phone, id } });
      await load();
      queryClient.invalidateQueries({ queryKey: ["menu"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "تعذّر الحذف");
    }
  }

  if (error) return <p className="py-10 text-center text-destructive">{error}</p>;
  if (!items) return <p className="py-10 text-center text-muted-foreground">جارِ التحميل...</p>;

  return (
    <div className="space-y-5">
      {editing === "new" && (
        <MenuItemForm
          categories={categories}
          busy={busy}
          onCancel={closeEditor}
          onSubmit={handleSubmit}
          onUploadImage={handleUploadImage}
          nextSortOrderFor={nextSortOrderFor}
        />
      )}

      {!editing && (
        <button
          onClick={() => openEditor("new")}
          className="rounded-full px-6 py-2.5 text-sm font-medium text-primary-foreground"
          style={{ backgroundImage: "var(--gradient-pink)" }}
        >
          + إضافة صنف جديد
        </button>
      )}

      {!editing && categories.length > 1 && (
        <Reveal>
          <div>
            <p className="mb-2 text-xs tracking-[0.25em] text-primary">الرفوف</p>
            <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() =>
                    document
                      .getElementById(`admin-cat-${cat.replace(/\s+/g, "-")}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="shrink-0 rounded-full border border-primary/40 bg-card px-4 py-1.5 text-sm text-ink shadow-[var(--shadow-card)] transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      {categoryError && <p className="text-sm text-destructive">{categoryError}</p>}

      {categories.map((cat) => (
        <div key={cat} id={`admin-cat-${cat.replace(/\s+/g, "-")}`} className="scroll-mt-24">
          <div className="mb-3 flex items-center gap-3">
            <label className="relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-primary/60 bg-muted text-center text-[10px] leading-4 text-primary">
              {categoryImage(cat) ? (
                <img src={categoryImage(cat)!} alt="" className="h-full w-full object-cover" />
              ) : categoryBusy === cat ? (
                "..."
              ) : (
                "+ صورة القسم"
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={categoryBusy !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) setCategoryCrop({ file, name: cat });
                }}
              />
            </label>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg text-ink">{cat}</h3>
              <p className="text-xs text-muted-foreground">
                {categoryBusy === cat
                  ? "جارِ الحفظ..."
                  : categoryImage(cat)
                    ? "اضغطي على الصورة لتغييرها"
                    : "صورة المربع الذي يظهر في الصفحة الرئيسية"}
              </p>
            </div>
            {categoryImage(cat) && (
              <button
                type="button"
                disabled={categoryBusy !== null}
                onClick={() => changeCategoryImage(cat, null)}
                className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
              >
                إزالة الصورة
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items
              .filter((item) => item.category === cat)
              .map((item) =>
                editing !== "new" && editing?.id === item.id ? (
                  <MenuItemForm
                    key={item.id}
                    initial={item}
                    initialDiscount={discounts.find((d) => d.product_id === item.id) ?? null}
                    categories={categories}
                    busy={busy}
                    onCancel={closeEditor}
                    onSubmit={handleSubmit}
                    onUploadImage={handleUploadImage}
                    nextSortOrderFor={nextSortOrderFor}
                  />
                ) : (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-3xl bg-card shadow-[var(--shadow-card)]"
                  >
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className={`max-h-56 w-full bg-muted object-contain ${
                          item.stock === 0 ? "opacity-50 grayscale" : ""
                        }`}
                      />
                    ) : (
                      <div className="flex h-36 w-full items-center justify-center bg-muted text-sm text-muted-foreground">
                        بدون صورة
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-ink">{item.name}</h4>
                        {item.stock === 0 ? (
                          <span className="shrink-0 rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">
                            نفذت الكمية
                          </span>
                        ) : item.stock !== null ? (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-ink">
                            متوفر: {item.stock}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                        <span className="font-bold text-primary">
                          {Number(item.sale_price ?? item.price).toFixed(2)} د.ل
                        </span>
                        {item.sale_price !== null && (
                          <span className="text-sm text-muted-foreground line-through">
                            {Number(item.price).toFixed(2)}
                          </span>
                        )}
                      </p>
                      {item.min_qty > 1 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          أقل كمية: {item.min_qty}
                        </p>
                      )}
                      {(() => {
                        const d = discounts.find((x) => x.product_id === item.id);
                        if (!d) return null;
                        const ended =
                          d.ends_at !== null && new Date(d.ends_at).getTime() <= Date.now();
                        return (
                          <p
                            className={`mt-1 text-xs ${ended ? "text-muted-foreground line-through" : "text-accent-foreground"}`}
                          >
                            كود {d.code}: {d.discount_price.toFixed(2)} د.ل
                            {d.ends_at
                              ? ` — ${ended ? "انتهى" : "حتى"} ${new Date(d.ends_at).toLocaleString("ar-LY", { dateStyle: "short", timeStyle: "short" })}`
                              : ""}
                          </p>
                        );
                      })()}
                      {item.variables.map((v) => (
                        <p key={v.name} className="mt-1 text-xs leading-5 text-muted-foreground">
                          {v.name}:{" "}
                          {v.values.map((x, i) => (
                            <span key={x.label}>
                              {i > 0 && "، "}
                              <span
                                className={x.stock === 0 ? "text-destructive line-through" : ""}
                              >
                                {x.label}
                              </span>
                              {x.stock === 0 ? " (نفذ)" : x.stock !== null ? ` (${x.stock})` : ""}
                            </span>
                          ))}
                        </p>
                      ))}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => openEditor(item.id)}
                          className="flex-1 rounded-full border border-primary px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => setDeleteTarget(item.id)}
                          className="rounded-full border border-destructive px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  </article>
                ),
              )}
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <p className="py-10 text-center text-muted-foreground">لا توجد أصناف بعد</p>
      )}

      <CropDialog
        file={categoryCrop?.file ?? null}
        output={SQUARE_CROP}
        onCancel={() => setCategoryCrop(null)}
        onDone={handleCategoryCropped}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="حذف هذا الصنف نهائيًا؟"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
