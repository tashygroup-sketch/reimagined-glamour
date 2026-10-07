import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  coverImage,
  getMenu,
  getCategories,
  getDiscountsAdmin,
  fetchPhotoForThumb,
  saveCategoryImage,
  saveMenuItem,
  saveThumbnail,
  deleteMenuItem,
  uploadMenuImage,
  type AdminDiscount,
  type CategoryInfo,
  type MenuItem,
} from "@/lib/shop.functions";
import { SQUARE_CROP, withUploadRetry } from "@/lib/image";
import { parseStock } from "@/lib/stock";
import { useCloseLayer, withLayer } from "@/lib/back-layer";
import { buildSearchIndex, searchProducts } from "@/lib/search";
import { letterOf, sortByName } from "@/lib/sort";
import { ensureThumbs, type ThumbJob, type ThumbProgress } from "@/lib/thumbs";
import { arCount } from "@/lib/utils";
import { Photo, PhotoGroup } from "@/components/Photo";
import { LetterPicker } from "@/components/LetterPicker";
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
  const storeThumb = useServerFn(saveThumbnail);
  const photoViaServer = useServerFn(fetchPhotoForThumb);
  const queryClient = useQueryClient();

  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [categoryInfo, setCategoryInfo] = useState<CategoryInfo[]>([]);
  const [discounts, setDiscounts] = useState<AdminDiscount[]>([]);
  const [categoryCrop, setCategoryCrop] = useState<{ file: File; name: string } | null>(null);
  const [categoryBusy, setCategoryBusy] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Same search as the shop (Arabic, English, Arabizi, typos), over every product here.
  const [query, setQuery] = useState("");
  // the product just jumped to with the letter list (outlined for a moment)
  const [jumpedTo, setJumpedTo] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<ThumbProgress | null>(null);
  const searchIndex = useMemo(() => buildSearchIndex(items ?? []), [items]);
  const results = useMemo(
    () => (query.trim() ? searchProducts(searchIndex, query) : null),
    [searchIndex, query],
  );

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

  // While this panel is open: make the light copy of every photo that doesn't have one yet
  // (photos uploaded before light copies existed), and find photos whose file is gone.
  useEffect(() => {
    if (!items) return;
    const jobs: ThumbJob[] = [];
    for (const c of categoryInfo) {
      if (c.image_url) jobs.push({ url: c.image_url, label: `صورة قسم «${c.name}»` });
    }
    for (const item of items) {
      const cover = coverImage(item);
      if (cover) jobs.push({ url: cover, label: item.name });
      for (const v of item.variables) {
        for (const x of v.values) {
          if (x.image_url) jobs.push({ url: x.image_url, label: `${item.name} — ${x.label}` });
        }
      }
    }
    let stopped = false;
    void ensureThumbs(
      jobs,
      {
        save: (url, dataBase64) => storeThumb({ data: { phone, url, dataBase64 } }),
        viaServer: (url) => photoViaServer({ data: { phone, url } }),
      },
      (p) => {
        if (!stopped) setThumbs(p);
      },
      () => stopped,
    );
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, categoryInfo]);

  // The page order: categories as listed, products alphabetical inside each.
  const letters = [...new Set((items ?? []).map((i) => letterOf(i.name)))];
  function jumpToLetter(letter: string) {
    for (const cat of categories) {
      const target = sortByName((items ?? []).filter((i) => i.category === cat)).find(
        (i) => letterOf(i.name) === letter,
      );
      if (!target) continue;
      document
        .getElementById(`admin-item-${target.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      setJumpedTo(target.id);
      window.setTimeout(() => setJumpedTo(null), 1800);
      return;
    }
  }

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
              ...(image.thumbBase64 ? { thumbBase64: image.thumbBase64 } : {}),
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
          ...(image.thumbBase64 ? { thumbBase64: image.thumbBase64 } : {}),
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

  // One product: its edit form while it's being edited, otherwise its card. A plain render
  // function (not an inner component), so the open form keeps what was typed when the list
  // re-renders.
  function renderItem(item: MenuItem, withCategory = false) {
    if (editing !== "new" && editing?.id === item.id) {
      return (
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
      );
    }
    const cover = coverImage(item);
    const discount = discounts.find((x) => x.product_id === item.id);
    const discountEnded =
      !!discount && discount.ends_at !== null && new Date(discount.ends_at).getTime() <= Date.now();
    return (
      <article
        key={item.id}
        id={`admin-item-${item.id}`}
        className={`scroll-mt-24 overflow-hidden rounded-3xl bg-card shadow-[var(--shadow-card)] transition-shadow duration-300 ${
          jumpedTo === item.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
        }`}
      >
        {cover ? (
          // fixed height: the card doesn't jump when its photo arrives
          <div
            className={`photo-slot h-56 w-full bg-muted ${
              item.stock === 0 ? "opacity-50 grayscale" : ""
            }`}
          >
            <Photo
              thumb
              src={cover}
              alt={item.name}
              className="h-full w-full object-contain"
              fallback={
                <p className="flex h-full items-center justify-center px-4 text-center text-sm leading-6 text-destructive">
                  تعذّر تحميل هذه الصورة — اضغطي «تعديل» وارفعيها من جديد
                </p>
              }
            />
          </div>
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
          {withCategory && <p className="text-xs text-muted-foreground">{item.category}</p>}
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
            <p className="mt-1 text-xs text-muted-foreground">أقل كمية: {item.min_qty}</p>
          )}
          {discount && (
            <p
              className={`mt-1 text-xs ${discountEnded ? "text-muted-foreground line-through" : "text-accent-foreground"}`}
            >
              كود {discount.code}: {discount.discount_price.toFixed(2)} د.ل
              {discount.ends_at
                ? ` — ${discountEnded ? "انتهى" : "حتى"} ${new Date(discount.ends_at).toLocaleString("ar-LY", { dateStyle: "short", timeStyle: "short" })}`
                : ""}
            </p>
          )}
          {item.variables.map((v) => (
            <p key={v.name} className="mt-1 text-xs leading-5 text-muted-foreground">
              {v.name}:{" "}
              {v.values.map((x, i) => (
                <span key={x.label}>
                  {i > 0 && "، "}
                  <span className={x.stock === 0 ? "text-destructive line-through" : ""}>
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
    );
  }

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

      {/* Search + alphabetical order. Hidden while a form is open, so the list can't change
          under the form and lose what was typed in it. */}
      {!editing && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block min-w-0 flex-1 basis-56">
            <span className="sr-only">ابحثي في منتجاتك</span>
            <Search className="pointer-events-none absolute top-1/2 right-4 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              dir="auto"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحثي في منتجاتك / Search"
              className="h-12 w-full rounded-full border border-border bg-card ps-11 pe-11 text-[16px] text-ink outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="مسح البحث"
                className="absolute top-1/2 left-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          {!results && letters.length > 1 && (
            <LetterPicker letters={letters} onPick={jumpToLetter} />
          )}
        </div>
      )}

      {/* Light copies being made for older photos, and photos whose file is gone. */}
      {thumbs && thumbs.left > 0 && thumbs.made > 0 && (
        <p role="status" className="rounded-2xl bg-accent px-4 py-3 text-sm text-accent-foreground">
          جارِ تجهيز نسخ خفيفة وسريعة من الصور… بقي {thumbs.left}. أبقي هذه الصفحة مفتوحة حتى تنتهي.
        </p>
      )}
      {thumbs && thumbs.left === 0 && thumbs.made > 0 && (
        <p role="status" className="rounded-2xl bg-accent px-4 py-3 text-sm text-accent-foreground">
          ✓ تم تجهيز نسخ خفيفة لـ {thumbs.made} صورة — ستظهر الآن في الموقع بسرعة.
        </p>
      )}
      {thumbs && thumbs.left === 0 && thumbs.broken.length > 0 && (
        <div className="rounded-2xl border border-destructive/40 bg-card px-4 py-3 text-sm">
          <p className="font-bold text-destructive">
            صور لا تعمل ({thumbs.broken.length}) — هذه لا تظهر في الموقع، ارفعيها من جديد:
          </p>
          <ul className="mt-1 list-inside list-disc text-ink">
            {thumbs.broken.map((b, i) => (
              <li key={i}>
                {b.label} <span className="text-xs text-muted-foreground">({b.reason})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!editing && !results && categories.length > 1 && (
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

      <PhotoGroup>
        {results ? (
          results.length > 0 ? (
            <div>
              <p className="mb-3 text-sm text-muted-foreground">
                {arCount(results.length, ["نتيجة واحدة", "نتيجتان", "نتائج", "نتيجة"])}
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((item) => renderItem(item, true))}
              </div>
            </div>
          ) : (
            <div className="py-10 text-center">
              <p className="text-lg text-ink">لا توجد نتائج لـ «{query.trim()}»</p>
              <p className="mt-2 text-sm text-muted-foreground">
                جرّبي كلمة أخرى، أو اسم اللون أو القسم.
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-5 rounded-full border border-primary px-6 py-2.5 text-sm font-bold text-primary"
              >
                عرض كل المنتجات
              </button>
            </div>
          )
        ) : (
          <div className="space-y-5">
            {categories.map((cat) => (
              <div key={cat} id={`admin-cat-${cat.replace(/\s+/g, "-")}`} className="scroll-mt-24">
                <div className="mb-3 flex items-center gap-3">
                  <label className="photo-slot relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-primary/60 bg-muted text-center text-[10px] leading-4 text-primary">
                    {categoryImage(cat) ? (
                      <Photo
                        thumb
                        src={categoryImage(cat)!}
                        className="h-full w-full object-cover"
                      />
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
                  {sortByName(items.filter((item) => item.category === cat)).map((item) =>
                    renderItem(item),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </PhotoGroup>
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
