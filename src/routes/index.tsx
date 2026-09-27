import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Plus, Search, ShoppingBag, X } from "lucide-react";
import { getCategories, getMenu, getStorySection, type MenuItem } from "@/lib/shop.functions";
import { LogoIntro } from "@/components/LogoIntro";
import { Carousel } from "@/components/Carousel";
import { BookingDialog } from "@/components/BookingDialog";
import { ProductSheet, formatPrice } from "@/components/ProductSheet";
import { SocialLinks } from "@/components/SocialLinks";
import { optionsLabel, useCart, type CartOption } from "@/lib/cart";
import { buildSearchIndex, searchProducts } from "@/lib/search";

const menuQuery = queryOptions({ queryKey: ["menu"], queryFn: () => getMenu() });
const storyQuery = queryOptions({ queryKey: ["story"], queryFn: () => getStorySection() });
const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: () => getCategories(),
});

// The open category lives in the URL (?cat=...), so the phone's back button returns from a
// category to the category squares instead of leaving the site.
type HomeSearch = { cat?: string };

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch =>
    typeof search["cat"] === "string" && search["cat"] ? { cat: search["cat"] } : {},
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(menuQuery),
      context.queryClient.ensureQueryData(storyQuery),
      context.queryClient.ensureQueryData(categoriesQuery),
    ]),
  head: () => ({
    meta: [
      { title: "Glamour with Jannat | مكياج وعناية بالبشرة" },
      {
        name: "description",
        content:
          "Glamour with Jannat — مكياج، عناية بالبشرة، عطور وعناية بالشعر. توصيل لجميع أنحاء ليبيا، اطلبي عبر واتساب.",
      },
      { property: "og:title", content: "Glamour with Jannat" },
      {
        property: "og:description",
        content: "جمالك يستحق الأفضل — تسوّقي الآن من Glamour with Jannat.",
      },
    ],
  }),
  component: Home,
});

// Arabic number agreement: 1 منتج واحد، 2 منتجان، 3–10 منتجات، 11+ منتج
function arCount(n: number, [one, two, few, many]: [string, string, string, string]) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

function Home() {
  const { data: menu } = useSuspenseQuery(menuQuery);
  const { data: story } = useSuspenseQuery(storyQuery);
  const { data: categoryInfo } = useSuspenseQuery(categoriesQuery);
  const { cat } = Route.useSearch();
  const navigate = useNavigate();
  const { lines, add, remove, setQty, count, total, qtyOfProduct } = useCart();

  const [booking, setBooking] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState<string | null>(null);
  const [menuPrompt, setMenuPrompt] = useState(false);
  const [query, setQuery] = useState("");
  const shopRef = useRef<HTMLElement>(null);

  const available = useMemo(() => menu.filter((m) => m.is_available), [menu]);

  // Categories come from the products (in product order); the admin's photo is used when
  // set, otherwise the first product photo in that category.
  const categories = useMemo(() => {
    const names = [...new Set(available.map((m) => m.category))];
    return names.map((name) => {
      const items = available.filter((m) => m.category === name);
      const photo =
        categoryInfo.find((c) => c.name === name)?.image_url ??
        items.find((m) => m.image_url)?.image_url ??
        null;
      return { name, items, photo };
    });
  }, [available, categoryInfo]);

  const activeCategory = categories.find((c) => c.name === cat) ?? null;

  const searchIndex = useMemo(() => buildSearchIndex(available), [available]);
  const results = useMemo(
    () => (query.trim() ? searchProducts(searchIndex, query) : null),
    [searchIndex, query],
  );

  // null = stock not tracked.
  const productById = new Map(menu.map((m) => [m.id, m]));
  function remainingFor(id: string) {
    const stock = productById.get(id)?.stock;
    if (stock === null || stock === undefined) return null;
    return Math.max(0, stock - qtyOfProduct(id));
  }
  const overStockIds = new Set(
    lines
      .filter((l) => {
        const stock = productById.get(l.id)?.stock;
        return stock !== null && stock !== undefined && qtyOfProduct(l.id) > stock;
      })
      .map((l) => l.id),
  );
  // Lines whose options no longer match the product (options added or edited after the
  // customer put it in the cart). The server would refuse these, so catch them here first.
  const staleKeys = new Set(
    lines
      .filter((l) => {
        const product = productById.get(l.id);
        if (!product || product.variables.length === 0) return false;
        return product.variables.some((v) => {
          const chosen = l.options?.find((o) => o.name === v.name);
          return !chosen || !v.values.some((x) => x.label === chosen.value);
        });
      })
      .map((l) => l.key),
  );

  function flash(setter: (v: string | null) => void, id: string, ms: number) {
    setter(id);
    window.setTimeout(() => setter(null), ms);
  }

  function handleQuickAdd(item: MenuItem) {
    if (item.variables.length > 0) {
      setSheetItem(item);
      return;
    }
    if (remainingFor(item.id) === 0) {
      flash(setLimitHit, item.id, 1600);
      return;
    }
    add({ id: item.id, name: item.name, price: Number(item.price), image_url: item.image_url });
    flash(setJustAdded, item.id, 1100);
  }

  function handleSheetAdd(item: MenuItem, options: CartOption[], qty: number) {
    // Cart thumbnail shows the chosen value's photo when there is one (e.g. the red shade).
    const valueImage = item.variables
      .map((v) => v.values.find((x) => x.label === options.find((o) => o.name === v.name)?.value))
      .find((x) => x?.image_url)?.image_url;
    add(
      {
        id: item.id,
        name: item.name,
        price: Number(item.price),
        image_url: valueImage ?? item.image_url,
        options,
      },
      qty,
    );
    setSheetItem(null);
    flash(setJustAdded, item.id, 1100);
  }

  function scrollToShop() {
    requestAnimationFrame(() =>
      shopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  function showCategory(name?: string) {
    setQuery("");
    navigate({ to: "/", search: name ? { cat: name } : {}, resetScroll: false });
    scrollToShop();
  }

  function handleBookingRequest() {
    if (lines.length > 0) {
      setCartOpen(true);
      return;
    }
    setMenuPrompt(true);
    scrollToShop();
    window.setTimeout(() => setMenuPrompt(false), 3500);
  }

  useEffect(() => {
    if (!cartOpen && !booking) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [cartOpen, booking]);

  // A plain render function, not an inner component: an inner component would be a new type
  // on every render and remount the whole list (and its images) on each search keystroke.
  function renderProductList(items: MenuItem[], withCategory = false) {
    return (
      <ul className="mt-2 divide-y divide-border">
        {items.map((item) => {
          const soldOut = item.stock === 0;
          return (
            <li
              key={item.id}
              className={`flex items-center gap-3 py-4 ${soldOut ? "opacity-55" : ""}`}
            >
              <button
                type="button"
                onClick={() => setSheetItem(item)}
                className="flex min-w-0 flex-1 items-center gap-3 text-start"
              >
                <span className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl bg-muted">
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt=""
                      loading="lazy"
                      className={`h-full w-full object-cover ${soldOut ? "grayscale" : ""}`}
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[16px] leading-6 font-bold text-ink">
                    {item.name}
                  </span>
                  {item.description && (
                    <span className="line-clamp-1 block text-sm text-muted-foreground">
                      {item.description}
                    </span>
                  )}
                  {withCategory && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {item.category}
                    </span>
                  )}
                  {item.variables.length > 0 && (
                    <span className="mt-0.5 block text-xs font-medium text-primary">
                      اختاري {item.variables.map((v) => v.name).join(" و")}
                    </span>
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickAdd(item)}
                disabled={soldOut}
                aria-label={soldOut ? `${item.name}: نفذت الكمية` : `أضيفي ${item.name} للسلة`}
                className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 font-extrabold transition-colors ${
                  soldOut || limitHit === item.id
                    ? "bg-muted text-muted-foreground"
                    : justAdded === item.id
                      ? "bg-ink text-white"
                      : "bg-primary text-primary-foreground hover:bg-accent-foreground"
                }`}
              >
                {soldOut ? (
                  <span className="text-sm">نفذت</span>
                ) : limitHit === item.id ? (
                  <span className="text-sm">المتوفر {item.stock} فقط</span>
                ) : justAdded === item.id ? (
                  <>
                    <Check className="h-4 w-4" strokeWidth={3} />
                    <span className="text-sm">أضيفت</span>
                  </>
                ) : (
                  <>
                    <span className="text-[17px] leading-none">{formatPrice(item.price)}</span>
                    <span className="text-[11px] leading-none">د.ل</span>
                    <Plus className="h-4 w-4" strokeWidth={3} />
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="relative overflow-x-clip">
      <LogoIntro />

      {/* header */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <button
            type="button"
            dir="ltr"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="font-wordmark text-[26px] leading-none tracking-wide text-primary"
          >
            GLAMOUR
          </button>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={`السلة: ${count}`}
            className="flex h-10 items-center gap-2 rounded-full bg-primary ps-4 pe-1.5 text-primary-foreground shadow-[var(--shadow-soft)]"
          >
            <ShoppingBag className="h-5 w-5" />
            <span
              key={count}
              className={`flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-1.5 text-sm font-extrabold text-primary ${
                count > 0 ? "cart-bump" : ""
              }`}
            >
              {count}
            </span>
          </button>
        </div>
      </header>

      {/* hero */}
      <section className="relative isolate overflow-hidden bg-primary text-primary-foreground">
        {story.hero_image_url && (
          <>
            <img
              src={story.hero_image_url}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 -z-10 bg-primary/80" />
          </>
        )}
        <div className="mx-auto grid max-w-5xl gap-12 px-5 pt-12 pb-16 md:grid-cols-[1.15fr_1fr] md:items-center md:pb-20">
          <div>
            <p className="text-[15px] font-medium text-white/90">{story.hero_title}</p>
            <h1
              dir="ltr"
              className="font-wordmark mt-2 text-right text-[clamp(3.5rem,21vw,8.5rem)] leading-[0.86] font-normal whitespace-nowrap"
            >
              GLAMOUR
            </h1>
            <p dir="ltr" className="mt-1 text-right text-xl font-medium text-white/90">
              with Jannat
            </p>
            <p className="mt-6 max-w-md text-[17px] leading-8 text-white/90">
              {story.hero_subtitle}
            </p>
            <button
              type="button"
              onClick={() => showCategory()}
              className="mt-8 h-14 rounded-full bg-white px-9 text-base font-extrabold text-primary shadow-[0_14px_30px_-14px_rgba(0,0,0,0.45)] transition-transform hover:scale-[1.02]"
            >
              تصفّحي المنتجات
            </button>
          </div>

          {/* ads card */}
          {story.images.length > 0 && (
            <div className="mx-auto w-[86%] max-w-sm -rotate-3 rounded-[28px] bg-white p-2 text-ink shadow-[0_30px_60px_-25px_rgba(0,0,0,0.5)]">
              <div className="overflow-hidden rounded-[22px]">
                <Carousel
                  images={story.images.map((img) => ({ url: img.image_url, ratio: img.ratio }))}
                  autoPlay={4500}
                />
              </div>
              <div className="flex items-center justify-between px-3 pb-1">
                <span dir="ltr" className="font-wordmark text-sm tracking-wide text-primary">
                  GLAMOUR
                </span>
                <span className="text-xs text-muted-foreground">عروضنا</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* shop */}
      <section id="menu" ref={shopRef} className="scroll-mt-14">
        <div className="sticky top-14 z-20 border-b border-border/70 bg-background/95 backdrop-blur-md">
          <div className="mx-auto max-w-5xl px-4 py-3">
            <label className="relative block">
              <span className="sr-only">ابحثي عن منتج</span>
              <Search className="pointer-events-none absolute top-1/2 right-4 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                dir="auto"
                enterKeyHint="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحثي عن منتج، لون أو قسم / Search"
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

            {activeCategory && !results && (
              <div className="scrollbar-none -mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4">
                <button
                  type="button"
                  onClick={() => showCategory()}
                  className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-muted px-3 text-sm text-ink"
                >
                  <ArrowRight className="h-4 w-4" />
                  كل الأقسام
                </button>
                {categories.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => showCategory(c.name)}
                    aria-current={c.name === activeCategory.name ? "true" : undefined}
                    className={`h-9 shrink-0 rounded-full px-4 text-sm font-bold transition-colors ${
                      c.name === activeCategory.name
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-primary"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto min-h-[60vh] max-w-5xl px-4 pt-6 pb-16">
          {menuPrompt && (
            <p
              role="status"
              className="animate-fade-in mx-auto mb-5 w-fit rounded-xl border border-primary/30 bg-accent px-5 py-3 text-center font-medium text-accent-foreground"
            >
              اختاري منتجًا أولاً
            </p>
          )}

          {results ? (
            results.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {arCount(results.length, ["نتيجة واحدة", "نتيجتان", "نتائج", "نتيجة"])}
                </p>
                {renderProductList(results, true)}
              </>
            ) : (
              <div className="py-12 text-center">
                <p className="text-lg text-ink">لا توجد نتائج لـ «{query.trim()}»</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  جرّبي كلمة أخرى، أو اسم اللون، أو تصفحي الأقسام.
                </p>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="mt-5 rounded-full border border-primary px-6 py-2.5 text-sm font-bold text-primary"
                >
                  تصفّحي الأقسام
                </button>
              </div>
            )
          ) : activeCategory ? (
            <>
              <h2 className="text-2xl text-ink">{activeCategory.name}</h2>
              {renderProductList(activeCategory.items)}
            </>
          ) : (
            <>
              <h2 className="text-2xl text-ink">تسوّقي حسب القسم</h2>
              {categories.length === 0 ? (
                <p className="py-12 text-center text-muted-foreground">لا توجد منتجات بعد</p>
              ) : (
                <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {categories.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => showCategory(c.name)}
                      className="group text-start"
                    >
                      <span className="block truncate text-base font-bold text-ink">{c.name}</span>
                      <span className="mt-2 block aspect-square overflow-hidden rounded-2xl border border-border bg-muted">
                        {c.photo ? (
                          <img
                            src={c.photo}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <span className="flex h-full items-center justify-center text-5xl font-extrabold text-primary/35">
                            {c.name.slice(0, 1)}
                          </span>
                        )}
                      </span>
                      <span className="mt-1.5 block text-xs text-muted-foreground">
                        {arCount(c.items.length, ["منتج واحد", "منتجان", "منتجات", "منتج"])}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* story */}
      <section className="border-t border-border bg-secondary px-5 py-16 text-center">
        <p className="text-sm font-bold text-primary">{story.story_label}</p>
        <h2 className="mt-3 text-3xl text-ink">{story.story_title}</h2>
        <p className="mx-auto mt-4 max-w-xl leading-8 text-muted-foreground">{story.story_text}</p>
      </section>

      {/* contact */}
      <footer className="bg-ink px-5 pt-14 pb-10 text-center text-white">
        <h2 className="text-2xl">تواصلي معنا</h2>
        <a
          href="tel:0918640785"
          dir="ltr"
          className="mt-3 inline-block text-2xl font-bold tracking-wide hover:text-primary-soft"
        >
          0918640785
        </a>
        <p className="mt-2 text-white/75">ليبيا، طرابلس - توصيل جميع أنحاء ليبيا</p>
        <SocialLinks className="mt-6" />
        <button
          type="button"
          onClick={handleBookingRequest}
          className="mt-9 h-12 rounded-full bg-white px-9 font-extrabold text-primary"
        >
          اطلبي الآن
        </button>
        <p className="mt-10 text-xs text-white/50">© Glamour with Jannat</p>
      </footer>

      {/* cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end overflow-hidden bg-ink/40 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="animate-scale-in max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-card p-6 sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl text-ink">سلة المشتريات</h2>
              <button
                onClick={() => setCartOpen(false)}
                aria-label="إغلاق"
                className="rounded-full px-3 py-1 hover:bg-muted"
              >
                ✕
              </button>
            </div>
            {lines.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground">السلة فارغة</p>
            ) : (
              <>
                <div className="mt-5 space-y-4">
                  {lines.map((l) => {
                    const stock = productById.get(l.id)?.stock;
                    return (
                      <div key={l.key} className="flex items-center gap-3">
                        {l.image_url && (
                          <img
                            src={l.image_url}
                            alt=""
                            className="h-14 w-14 shrink-0 rounded-2xl object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-ink">{l.name}</p>
                          {l.options && l.options.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {optionsLabel(l.options)}
                            </p>
                          )}
                          <p className="text-sm text-muted-foreground">{l.price.toFixed(2)} د.ل</p>
                          {overStockIds.has(l.id) && (
                            <p className="text-xs text-destructive">
                              {stock === 0 ? "نفذت الكمية — يرجى إزالته" : `المتوفر ${stock} فقط`}
                            </p>
                          )}
                          {staleKeys.has(l.key) && (
                            <p className="text-xs text-destructive">
                              تغيّرت خيارات هذا المنتج، احذفيه وأضيفيه من جديد
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setQty(l.key, l.qty - 1)}
                            aria-label="إنقاص"
                            className="h-8 w-8 rounded-full bg-muted"
                          >
                            −
                          </button>
                          <span>{l.qty}</span>
                          <button
                            onClick={() => setQty(l.key, l.qty + 1)}
                            disabled={remainingFor(l.id) === 0}
                            aria-label="زيادة"
                            className="h-8 w-8 rounded-full bg-muted disabled:opacity-40"
                          >
                            +
                          </button>
                          <button
                            onClick={() => remove(l.key)}
                            aria-label="إزالة الصنف"
                            className="mr-1 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 flex justify-between border-t border-border pt-4 font-bold text-ink">
                  <span>الإجمالي</span>
                  <span>{total.toFixed(2)} د.ل</span>
                </div>
                {(overStockIds.size > 0 || staleKeys.size > 0) && (
                  <p className="mt-4 text-center text-sm text-destructive">
                    عدّلي الأصناف المحددة باللون الأحمر لإكمال الطلب
                  </p>
                )}
                <button
                  onClick={() => {
                    setCartOpen(false);
                    setBooking(true);
                  }}
                  disabled={overStockIds.size > 0 || staleKeys.size > 0}
                  className="mt-5 w-full rounded-full px-6 py-3 font-bold text-primary-foreground disabled:opacity-50"
                  style={{ backgroundImage: "var(--gradient-pink)" }}
                >
                  إتمام الطلب
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <ProductSheet
        item={sheetItem}
        remaining={sheetItem ? remainingFor(sheetItem.id) : null}
        onClose={() => setSheetItem(null)}
        onAdd={handleSheetAdd}
      />

      <BookingDialog open={booking} onClose={() => setBooking(false)} />
    </div>
  );
}
