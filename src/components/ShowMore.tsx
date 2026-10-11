import { useEffect, useRef } from "react";

// Shows the next products of a long list when the visitor scrolls near the end of what's
// shown (well before reaching it), or when the button is tapped.
export function ShowMore({ left, onMore }: { left: number; onMore: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const latest = useRef(onMore);
  latest.current = onMore;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) latest.current();
      },
      { rootMargin: "0px 0px 1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [left]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onMore}
      className="mx-auto mt-8 block rounded-full border border-primary px-6 py-2.5 text-sm font-bold text-primary"
    >
      عرض المزيد ({left})
    </button>
  );
}
