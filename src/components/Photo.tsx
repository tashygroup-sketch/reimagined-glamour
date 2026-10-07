import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { isLoaded, isMissing, markLoaded, markMissing, thumbUrl } from "@/lib/photos";

// Product and category photos.
//
//  * `thumb`: shows the photo's light copy (see src/lib/photos.ts) — what cards, category
//    squares and other small spots use. If the light copy doesn't exist yet, the full photo
//    is shown instead.
//  * A photo this page has already downloaded (the shop fetches the light copies in the
//    background) is shown instantly: no empty box, no fade.
//  * Never lazy: every photo of the list on screen starts downloading right away, instead of
//    one by one as the customer scrolls (which looked like "some photos are missing").
//  * A photo that fails to download (weak phone signal) is tried again by itself a few times,
//    and once more when the phone comes back online. Before, a failed photo stayed an empty
//    box until the page was refreshed.
//  * Inside a <PhotoGroup>, the photos appear together once all of them have arrived, rather
//    than popping in one after another. The rest never waits for a photo that failed (it
//    joins them when a retry succeeds), nor more than `capMs` for a slow one: after that,
//    what has arrived is shown and the rest follows.

// Waits before trying a failed photo again.
const RETRY_DELAYS = [700, 2000, 5000];

type Gate = {
  subscribe: (onChange: () => void) => () => void;
  isOpen: () => boolean;
  add: (token: object) => void;
  done: (token: object) => void;
};

function createGate(capMs: number): Gate {
  const waiting = new Set<object>();
  const listeners = new Set<() => void>();
  let open = true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function setOpen(next: boolean) {
    if (open === next) return;
    open = next;
    listeners.forEach((fn) => fn());
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    isOpen: () => open,
    add(token) {
      waiting.add(token);
      if (!open) return;
      // A new batch of photos starts: hold them back until all are in (or the time is up).
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setOpen(true), capMs);
      setOpen(false);
    },
    done(token) {
      if (!waiting.delete(token) || waiting.size > 0) return;
      if (timer) clearTimeout(timer);
      timer = null;
      setOpen(true);
    },
  };
}

// Outside a group a photo simply appears as soon as it has loaded.
const NO_GATE: Gate = {
  subscribe: () => () => {},
  isOpen: () => true,
  add: () => {},
  done: () => {},
};

const GateContext = createContext<Gate>(NO_GATE);

export function PhotoGroup({ children, capMs = 4000 }: { children: ReactNode; capMs?: number }) {
  const [gate] = useState(() => createGate(capMs));
  return <GateContext.Provider value={gate}>{children}</GateContext.Provider>;
}

type PhotoProps = {
  src: string;
  alt?: string;
  className?: string;
  // show the light copy when there is one
  thumb?: boolean;
  // shown in place of a photo that could not be downloaded at all
  fallback?: ReactNode;
};

// A different photo starts from scratch (its own loading state and retries).
export function Photo(props: PhotoProps) {
  return <PhotoInner key={props.src} {...props} />;
}

function PhotoInner({ src, alt = "", className = "", thumb = false, fallback }: PhotoProps) {
  const gate = useContext(GateContext);
  // false on the server: photos are revealed by the browser once they have really arrived
  const open = useSyncExternalStore(gate.subscribe, gate.isOpen, () => false);
  const ref = useRef<HTMLImageElement>(null);
  const token = useRef<object | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const small = thumb ? thumbUrl(src) : null;
  // Start with the light copy unless this page already found out it doesn't exist.
  const [useSmall, setUseSmall] = useState(() => small !== null && !isMissing(small));
  const base = useSmall && small ? small : src;
  const [attempt, setAttempt] = useState(0);
  // Already downloaded by this page: visible from the first moment.
  const [instant] = useState(() => isLoaded(base));
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">(
    instant ? "loaded" : "loading",
  );
  const [shown, setShown] = useState(instant);

  // A retry asks for the same file under a slightly different address, so the browser really
  // downloads it again instead of repeating the failure it remembers.
  const canRetry = !/^(blob|data):/i.test(base);
  const url =
    attempt === 0 || !canRetry ? base : `${base}${base.includes("?") ? "&" : "?"}retry=${attempt}`;

  // This photo no longer keeps the others of its group waiting.
  function release() {
    if (token.current) gate.done(token.current);
    token.current = null;
  }

  function settle(next: "loaded" | "failed") {
    setStatus(next);
    release();
  }

  function handleLoad() {
    markLoaded(base);
    settle("loaded");
  }

  function handleError() {
    if (useSmall && small) {
      // No light copy (yet): show the full photo instead. The group keeps waiting for it.
      markMissing(small);
      setUseSmall(false);
      setAttempt(0);
      return;
    }
    release();
    const delay = canRetry ? RETRY_DELAYS[attempt] : undefined;
    if (delay === undefined) {
      settle("failed");
      return;
    }
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => setAttempt((n) => n + 1), delay);
  }

  useEffect(() => {
    if (instant) return;
    const mine = {};
    token.current = mine;
    gate.add(mine);
    // The photo may already have finished before these handlers were attached (it came with
    // the page's HTML, or it's in the browser's memory): read the result directly.
    const el = ref.current;
    if (el?.complete) {
      if (el.naturalWidth > 0) handleLoad();
      else handleError();
    }
    return () => {
      gate.done(mine);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
    // once per photo: `key={src}` above remounts this component for a new photo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gave up while the phone had no connection: try once more when it's back.
  useEffect(() => {
    if (status !== "failed" || !canRetry) return;
    const again = () => {
      setStatus("loading");
      setAttempt((n) => n + 1);
    };
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [status, canRetry]);

  useEffect(() => {
    if (status === "loaded" && open) setShown(true);
  }, [status, open]);

  if (status === "failed" && fallback !== undefined) return <>{fallback}</>;

  return (
    <img
      ref={ref}
      src={url}
      alt={alt}
      decoding={instant ? "sync" : "async"}
      data-photo={shown ? "shown" : status === "failed" ? "failed" : "loading"}
      onLoad={handleLoad}
      onError={handleError}
      className={`${className} ${instant ? "" : "transition-opacity duration-300"} ${
        shown ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
