import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listOrders } from "@/lib/shop.functions";
import { MenuPanel } from "@/components/admin/MenuPanel";
import { StoryPanel } from "@/components/admin/StoryPanel";
import { OrdersPanel } from "@/components/admin/OrdersPanel";
import logoAsset from "@/assets/logo.jpg.asset.json";

const STORAGE_KEY = "glamour-admin-phone";

// ?tab=story / ?tab=orders = the second / third tab; ?edit=<id|new> = the product form that's
// open (see MenuPanel). Both in the URL so a refresh keeps them and the back button closes
// the form first.
type AdminTab = "menu" | "story" | "orders";
type AdminSearch = { tab?: "story" | "orders"; edit?: string };

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>): AdminSearch => ({
    ...(search["tab"] === "story" || search["tab"] === "orders" ? { tab: search["tab"] } : {}),
    ...(typeof search["edit"] === "string" && search["edit"] ? { edit: search["edit"] } : {}),
  }),
  head: () => ({
    meta: [{ title: "لوحة تحكم Glamour with Jannat" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  // listOrders doubles as the server-side admin check: it throws unless the phone is the
  // admin code, so the client never needs to know that code itself. The code is entered
  // once in the booking form's phone field and stored in localStorage, so anyone who has
  // it gets in from any browser — no separate gate page here.
  const verify = useServerFn(listOrders);
  const navigate = useNavigate();

  const [phone, setPhone] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const search = Route.useSearch();
  const tab: AdminTab = search.tab ?? "menu";
  // Switching tabs replaces the entry instead of adding one: back leaves the panel as a whole
  // (or closes an open form), it doesn't flip through tabs.
  function setTab(next: AdminTab) {
    void navigate({
      to: "/admin",
      search: next === "menu" ? {} : { tab: next },
      replace: true,
      resetScroll: false,
    });
  }

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!stored) {
      navigate({ to: "/", replace: true });
      return;
    }
    verify({ data: { phone: stored } })
      .then(() => setPhone(stored))
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        navigate({ to: "/", replace: true });
      })
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking || !phone) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        جارِ التحقق...
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img src={logoAsset.url} alt="" className="h-9 w-9 rounded-full object-contain" />
            <span className="text-ink">لوحة تحكم Glamour</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                navigate({ to: "/", replace: true });
              }}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:text-primary"
            >
              خروج
            </button>
            <a
              href="/"
              className="rounded-full px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)]"
              style={{ backgroundImage: "var(--gradient-pink)" }}
            >
              الرجوع الى الموقع
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 inline-flex rounded-full bg-muted p-1">
          <button
            onClick={() => setTab("menu")}
            className={`rounded-full px-5 py-2 text-sm transition-colors ${
              tab === "menu" ? "bg-card text-ink shadow" : "text-muted-foreground"
            }`}
          >
            المنتجات
          </button>
          <button
            onClick={() => setTab("story")}
            className={`rounded-full px-5 py-2 text-sm transition-colors ${
              tab === "story" ? "bg-card text-ink shadow" : "text-muted-foreground"
            }`}
          >
            الواجهة والإعلانات
          </button>
          {/* Every order is saved here when it's sent, including any whose WhatsApp message
              never went out. */}
          <button
            onClick={() => setTab("orders")}
            className={`rounded-full px-5 py-2 text-sm transition-colors ${
              tab === "orders" ? "bg-card text-ink shadow" : "text-muted-foreground"
            }`}
          >
            الطلبات
          </button>
        </div>

        {tab === "menu" && <MenuPanel phone={phone} />}
        {tab === "story" && <StoryPanel phone={phone} />}
        {tab === "orders" && <OrdersPanel phone={phone} />}
      </main>
    </div>
  );
}
