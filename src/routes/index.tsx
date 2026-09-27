import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMenu, getStorySection } from "@/lib/shop.functions";
import { LogoIntro } from "@/components/LogoIntro";
import { Reveal } from "@/components/Reveal";
import { Carousel } from "@/components/Carousel";
import { BookingDialog } from "@/components/BookingDialog";
import { useCart } from "@/lib/cart";
import logoAsset from "@/assets/logo.jpg.asset.json";

const menuQuery = queryOptions({ queryKey: ["menu"], queryFn: () => getMenu() });
const storyQuery = queryOptions({ queryKey: ["story"], queryFn: () => getStorySection() });

export const Route = createFileRoute("/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(menuQuery),
      context.queryClient.ensureQueryData(storyQuery),
    ]),
  head: () => ({
    meta: [
      { title: "Glamour with Jannat | مكياج وعناية بالبشرة" },
      {
        name: "description",
        content:
          "Glamour with Jannat — مكياج، عناية بالبشرة وعطور مختارة بعناية. اطلبي منتجاتك بسهولة عبر واتساب.",
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

function Home() {
  const { data: menu } = useSuspenseQuery(menuQuery);
  const { data: story } = useSuspenseQuery(storyQuery);
  const heroImage = story.hero_image_url;
  const { lines, add, remove, setQty, count, total } = useCart();
  const [booking, setBooking] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState<string | null>(null);
  const [menuPrompt, setMenuPrompt] = useState(false);

  const available = menu.filter((m) => m.is_available);
  const categories = [...new Set(available.map((m) => m.category))];

  function categoryAnchor(cat: string) {
    return `cat-${cat.replace(/\s+/g, "-")}`;
  }

  function scrollToCategory(cat: string) {
    document
      .getElementById(categoryAnchor(cat))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // null = stock not tracked. Used to grey out sold-out items and cap cart quantities.
  const stockById = new Map(menu.map((m) => [m.id, m.stock]));
  const qtyInCart = (id: string) => lines.find((l) => l.id === id)?.qty ?? 0;
  const atLimit = (id: string) => {
    const stock = stockById.get(id);
    return stock !== null && stock !== undefined && qtyInCart(id) >= stock;
  };
  // Lines asking for more than is left (e.g. it sold out while sitting in the cart).
  const overStockLines = lines.filter((l) => {
    const stock = stockById.get(l.id);
    return stock !== null && stock !== undefined && l.qty > stock;
  });

  function handleAdd(item: (typeof available)[number]) {
    if (atLimit(item.id)) {
      setLimitHit(item.id);
      window.setTimeout(() => setLimitHit((cur) => (cur === item.id ? null : cur)), 1600);
      return;
    }
    add({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      image_url: item.image_url,
    });
    setJustAdded(item.id);
    window.setTimeout(() => setJustAdded((cur) => (cur === item.id ? null : cur)), 1100);
  }

  function handleBookingRequest() {
    if (lines.length > 0) {
      setCartOpen(true);
      return;
    }

    setMenuPrompt(true);
    document.getElementById("menu")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  return (
    <div className="relative overflow-x-hidden">
      <LogoIntro />

      {/* header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src={logoAsset.url}
              alt="شعار Glamour with Jannat"
              width={48}
              height={48}
              className="h-11 w-11 object-contain"
            />
            <span className="text-lg text-ink">Glamour with Jannat</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCartOpen(true)}
              className="relative rounded-full border border-border px-4 py-2 text-sm text-ink"
            >
              السلة
              {count > 0 && (
                <span
                  key={count}
                  className="cart-bump absolute -top-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
                >
                  {count}
                </span>
              )}
            </button>
            <button
              onClick={handleBookingRequest}
              className="rounded-full px-5 py-2 text-sm font-medium text-primary-foreground"
              style={{ backgroundImage: "var(--gradient-pink)" }}
            >
              اطلبي الآن
            </button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative isolate overflow-hidden px-4 pt-16 pb-24 text-center">
        {heroImage ? (
          <>
            {/* admin's photo: slightly blurred (scaled up so the blur doesn't leave soft edges)
                under a dark tint, so the white text and logo stay readable on any photo */}
            <img
              src={heroImage}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-20 h-full w-full scale-110 object-cover blur-[3px]"
            />
            <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
          </>
        ) : (
          <>
            <div
              className="pointer-events-none absolute inset-0 -z-10"
              style={{ background: "var(--gradient-petal)" }}
            />
            <div className="pointer-events-none absolute -top-16 -right-10 -z-10 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          </>
        )}
        <Reveal variant="zoom">
          <img
            src={logoAsset.url}
            alt="Glamour with Jannat"
            width={260}
            height={260}
            className="float-slow mx-auto h-40 w-40 object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.2)] sm:h-52 sm:w-52"
          />
        </Reveal>
        <Reveal delay={150}>
          <h1
            className={`mt-8 text-4xl leading-tight sm:text-5xl ${
              heroImage ? "text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]" : "text-ink"
            }`}
          >
            {story.hero_title}
          </h1>
        </Reveal>
        <Reveal delay={280}>
          <p
            className={`mx-auto mt-4 max-w-md ${heroImage ? "text-white/85" : "text-muted-foreground"}`}
          >
            {story.hero_subtitle}
          </p>
        </Reveal>
        <Reveal delay={420}>
          <button
            onClick={handleBookingRequest}
            className="mt-8 rounded-full px-10 py-4 text-lg font-medium text-primary-foreground shadow-[var(--shadow-soft)]"
            style={{ backgroundImage: "var(--gradient-pink)" }}
          >
            تسوّقي الآن
          </button>
        </Reveal>
      </section>

      {/* story */}
      <section className="mx-auto max-w-4xl px-4 py-16">
        <Reveal>
          <p className="text-center text-sm tracking-[0.35em] text-primary">{story.story_label}</p>
        </Reveal>
        <Reveal delay={120}>
          <h2 className="mt-4 text-center text-3xl text-ink">{story.story_title}</h2>
        </Reveal>
        <Reveal delay={240}>
          <p className="mx-auto mt-5 max-w-xl text-center leading-8 text-muted-foreground">
            {story.story_text}
          </p>
        </Reveal>
        {story.images.length > 0 && (
          <Reveal delay={280}>
            {/* Full-bleed breakout: margin math (not left/right positioning) so it centers
                correctly under dir="rtl" too — left/right flip meaning in RTL. */}
            <div className="mx-[calc(50%-50vw)] mt-12 w-screen md:mx-auto md:w-full md:max-w-xl">
              <Carousel
                images={story.images.map((img) => ({ url: img.image_url, ratio: img.ratio }))}
              />
            </div>
          </Reveal>
        )}
      </section>

      {/* menu */}
      <section id="menu" className="mx-auto max-w-5xl px-4 py-16">
        <Reveal>
          <p className="text-center text-sm tracking-[0.35em] text-primary">منتجاتنا</p>
        </Reveal>
        <Reveal delay={120}>
          <h2 className="mt-4 text-center text-3xl text-ink">اكتشفي مجموعتنا</h2>
        </Reveal>

        {menuPrompt && (
          <p
            role="status"
            className="animate-fade-in mx-auto mt-5 w-fit rounded-xl border border-primary/30 bg-accent px-5 py-3 text-center font-medium text-accent-foreground shadow-[var(--shadow-card)]"
          >
            اختاري منتجًا أولاً
          </p>
        )}

        {categories.length > 1 && (
          <Reveal>
            <div className="scrollbar-none -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 pb-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => scrollToCategory(cat)}
                  className="shrink-0 rounded-full border border-primary/40 bg-card px-5 py-2 text-sm text-ink shadow-[var(--shadow-card)] transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  {cat}
                </button>
              ))}
            </div>
          </Reveal>
        )}

        {categories.map((cat, ci) => (
          <div key={cat} id={categoryAnchor(cat)} className="mt-12 scroll-mt-24">
            <Reveal>
              <h3 className="text-xl text-ink">{cat}</h3>
            </Reveal>
            <div className="mt-5 grid grid-cols-1 gap-5">
              {available
                .filter((m) => m.category === cat)
                .map((item, i) => (
                  <Reveal key={item.id} delay={i * 110 + ci * 40} variant="up">
                    <article
                      className={`group relative overflow-hidden rounded-3xl bg-card shadow-[var(--shadow-card)] transition ${
                        item.stock === 0 ? "opacity-60 grayscale" : ""
                      }`}
                    >
                      {item.stock === 0 && (
                        <span className="absolute top-3 right-3 z-10 rounded-full bg-ink/80 px-3 py-1 text-xs text-white">
                          نفذت الكمية
                        </span>
                      )}
                      {item.image_url || item.extra_images.length > 0 ? (
                        <Carousel
                          images={[
                            item.image_url
                              ? { url: item.image_url, ratio: item.image_ratio }
                              : null,
                            ...item.extra_images.map((url, idx) => ({
                              url,
                              ratio: item.extra_image_ratios[idx] ?? null,
                            })),
                          ].filter(
                            (img): img is { url: string; ratio: number | null } => img !== null,
                          )}
                        />
                      ) : null}
                      <div className="p-5">
                        <h4 className="text-lg text-ink">{item.name}</h4>
                        {item.description && (
                          <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                        )}
                        <div className="mt-4 flex items-center justify-between">
                          <span className="font-bold text-primary">
                            {Number(item.price).toFixed(2)} د.ل
                          </span>
                          {item.stock === 0 ? (
                            <button
                              disabled
                              className="cursor-not-allowed rounded-full border border-border px-4 py-2 text-sm text-muted-foreground"
                            >
                              نفذت الكمية
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAdd(item)}
                              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                                limitHit === item.id
                                  ? "border-border text-muted-foreground"
                                  : justAdded === item.id
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                              }`}
                            >
                              {limitHit === item.id
                                ? `المتوفر ${item.stock} فقط`
                                : justAdded === item.id
                                  ? "✓ أضيفت للسلة"
                                  : "أضيفي للسلة"}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  </Reveal>
                ))}
            </div>
          </div>
        ))}
      </section>

      {/* contact */}
      <footer
        className="mt-10 px-4 py-16 text-center"
        style={{ background: "var(--gradient-petal)" }}
      >
        <Reveal variant="zoom">
          <img
            src={logoAsset.url}
            alt="شعار Glamour with Jannat"
            loading="lazy"
            width={120}
            height={120}
            className="mx-auto h-24 w-24 object-contain"
          />
        </Reveal>
        <Reveal delay={120}>
          <h2 className="mt-6 text-2xl text-ink">اطلبي الآن</h2>
          <p className="mt-2 text-muted-foreground" dir="ltr">
            0915554139
          </p>
          <button
            onClick={handleBookingRequest}
            className="mt-6 rounded-full px-8 py-3 font-medium text-primary-foreground"
            style={{ backgroundImage: "var(--gradient-pink)" }}
          >
            اطلبي الآن
          </button>
        </Reveal>

        <Reveal delay={220}>
          <div className="mx-auto mt-10 max-w-sm rounded-3xl bg-card/70 p-5 text-sm text-muted-foreground">
            <p className="text-xs tracking-[0.3em] text-primary">تواصلي معنا</p>
            <p className="mt-2 text-ink">
              بنغازي، ليبيا — توصيل داخل المدينة
            </p>
            <a
              href="https://www.google.com/maps/search/?api=1&query=Benghazi%2C+Libya"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-primary bg-card px-5 py-3 font-bold text-primary shadow-[var(--shadow-card)] transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              📍 افتحي الموقع في خرائط جوجل
            </a>
            <p className="mt-4">
              <a href="tel:0915554139" dir="ltr" className="text-ink hover:text-primary">
                0915554139
              </a>
            </p>
          </div>
        </Reveal>

        <Reveal delay={320}>
          <p className="mt-8 text-xs text-muted-foreground">© Glamour with Jannat</p>
        </Reveal>
      </footer>

      {/* cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end overflow-hidden bg-ink/40 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="animate-scale-in max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-card p-6 sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl text-ink">سلة المشتريات</h2>
              <button
                onClick={() => setCartOpen(false)}
                className="rounded-full px-3 py-1 hover:bg-muted"
              >
                ✕
              </button>
            </div>
            {lines.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground">السلة فارغة</p>
            ) : (
              <>
                <div className="mt-5 space-y-3">
                  {lines.map((l) => (
                    <div key={l.id} className="flex items-center gap-3">
                      {l.image_url && (
                        <img
                          src={l.image_url}
                          alt={l.name}
                          className="h-14 w-14 rounded-2xl object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <p className="text-ink">{l.name}</p>
                        <p className="text-sm text-muted-foreground">{l.price.toFixed(2)} د.ل</p>
                        {overStockLines.some((o) => o.id === l.id) && (
                          <p className="text-xs text-destructive">
                            {stockById.get(l.id) === 0
                              ? "نفذت الكمية — يرجى إزالته"
                              : `المتوفر ${stockById.get(l.id)} فقط`}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setQty(l.id, l.qty - 1)}
                          className="h-8 w-8 rounded-full bg-muted"
                        >
                          −
                        </button>
                        <span>{l.qty}</span>
                        <button
                          onClick={() => setQty(l.id, l.qty + 1)}
                          disabled={atLimit(l.id)}
                          className="h-8 w-8 rounded-full bg-muted disabled:opacity-40"
                        >
                          +
                        </button>
                        <button
                          onClick={() => remove(l.id)}
                          aria-label="إزالة الصنف"
                          className="mr-1 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex justify-between border-t border-border pt-4 font-bold text-ink">
                  <span>الإجمالي</span>
                  <span>{total.toFixed(2)} د.ل</span>
                </div>
                {overStockLines.length > 0 && (
                  <p className="mt-4 text-center text-sm text-destructive">
                    بعض الأصناف لم تعد متوفرة بالكمية المطلوبة، يرجى تعديل السلة
                  </p>
                )}
                <button
                  onClick={() => {
                    setCartOpen(false);
                    setBooking(true);
                  }}
                  disabled={overStockLines.length > 0}
                  className="mt-5 w-full rounded-full px-6 py-3 font-medium text-primary-foreground disabled:opacity-50"
                  style={{ backgroundImage: "var(--gradient-pink)" }}
                >
                  إتمام الطلب
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <BookingDialog open={booking} onClose={() => setBooking(false)} />
    </div>
  );
}
