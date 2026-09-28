import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";

// ---------- the phone's back button closes the top window ----------
//
// Each open window (product sheet, cart, edit form, crop screen…) gets its own history
// entry, marked with `__layer` in the entry's state. Back then closes that window instead of
// leaving the page, and a window closed with its own ✕ removes its entry again, so back
// and forward never get out of step.

type LayerState = { __layer?: string; __TSR_index?: number; __TSR_key?: string };

export function layerOf(state: unknown): string | undefined {
  return (state as LayerState | undefined)?.__layer;
}

function indexOf(state: unknown): number {
  return (state as LayerState | undefined)?.__TSR_index ?? 0;
}

// Adds the marker to a history state (used as `state:` in navigate calls that open a window).
export function withLayer<T extends object>(state: T, id = "1"): T {
  return { ...state, __layer: id };
}

// Keeps whatever marker the current entry has (for `replace` navigations between windows).
export function keepLayer<T extends object>(state: T): T {
  return { ...state, __layer: layerOf(state) };
}

// Closing a window whose open/closed state lives in the URL (?p=, ?panel=, ?edit=).
// If this entry was added by opening the window, step back over it; if the page was opened
// straight on that URL (a shared link, a refresh in a new tab), there's nothing of ours to
// step back to, so `fallback` swaps the URL in place instead.
export function useCloseLayer() {
  const router = useRouter();
  const pendingKey = useRef<string | null>(null);
  return (fallback: () => void) => {
    const state = router.history.location.state as LayerState;
    // A double tap on ✕ must not step back twice.
    if (pendingKey.current && pendingKey.current === state.__TSR_key) return;
    if (layerOf(state)) {
      pendingKey.current = state.__TSR_key ?? null;
      router.history.back();
    } else {
      fallback();
    }
  };
}

// For windows whose open/closed state is a normal React state (crop screen, confirm box):
// while `open` is true there's an extra history entry, and back runs `onClose`.
export function useBackClose(open: boolean, onClose: () => void) {
  const router = useRouter();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const session = useRef<{
    id: string;
    index: number;
    closedByBack: boolean;
    timer?: number | undefined;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    let s = session.current;
    if (s && s.timer !== undefined) {
      // Same window, effect ran again (React dev mode does this): keep the existing entry.
      window.clearTimeout(s.timer);
      s.timer = undefined;
    } else {
      const id = Math.random().toString(36).slice(2, 10);
      s = session.current = {
        id,
        index: indexOf(router.history.location.state) + 1,
        closedByBack: false,
      };
      void router.navigate({
        to: ".",
        search: true,
        state: (prev) => withLayer(prev, id),
        resetScroll: false,
      });
    }
    const current = s;
    const unsubscribe = router.history.subscribe(({ location }) => {
      if (!current.closedByBack && indexOf(location.state) < current.index) {
        current.closedByBack = true;
        onCloseRef.current();
      }
    });
    return () => {
      unsubscribe();
      if (current.closedByBack) {
        session.current = null;
        return;
      }
      // Closed by its own button: remove our entry. Deferred one tick so a React dev-mode
      // re-run (above) can cancel it.
      current.timer = window.setTimeout(() => {
        session.current = null;
        if (layerOf(router.history.location.state) === current.id) router.history.back();
      }, 0);
    };
  }, [open, router]);
}

// Stops the page behind a full-screen window from scrolling (html + body, which iPhone
// Safari needs). Counted, so two windows open at once don't unlock each other.
let lockCount = 0;
let savedOverflow: [string, string] = ["", ""];

export function useLockScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    const body = document.body;
    if (lockCount === 0) {
      savedOverflow = [html.style.overflow, body.style.overflow];
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
    }
    lockCount++;
    return () => {
      lockCount--;
      if (lockCount === 0) {
        html.style.overflow = savedOverflow[0];
        body.style.overflow = savedOverflow[1];
      }
    };
  }, [active]);
}
