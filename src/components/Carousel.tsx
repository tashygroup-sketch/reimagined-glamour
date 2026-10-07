import { useEffect, useRef, useState } from "react";
import { Photo } from "@/components/Photo";
import { isLoaded, thumbUrl } from "@/lib/photos";

export type CarouselImage = { url: string; ratio?: number | null };

// Fallback only, for photos uploaded before their ratio was stored in the database.
function useFallbackRatio(src: string, skip: boolean, onRatio: (ratio: number) => void) {
  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled && probe.naturalWidth > 0) {
        onRatio(probe.naturalHeight / probe.naturalWidth);
      }
    };
    probe.src = src;
    if (probe.complete && probe.naturalWidth > 0) {
      onRatio(probe.naturalHeight / probe.naturalWidth);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, skip]);
}

function Slide({
  image,
  onMeasured,
}: {
  image: CarouselImage;
  onMeasured: (ratio: number) => void;
}) {
  const known = typeof image.ratio === "number" ? image.ratio : null;
  useFallbackRatio(image.url, known !== null, onMeasured);
  // The product page opens with the light copy the card was already showing, and the full
  // photo replaces it as soon as it has arrived — instead of an empty box in between.
  const small = thumbUrl(image.url);
  const [underlay] = useState(() => (small && isLoaded(small) ? small : null));
  return (
    <div
      data-slide
      className="w-full shrink-0 snap-center bg-contain bg-center bg-no-repeat"
      style={underlay ? { backgroundImage: `url("${underlay}")` } : undefined}
    >
      <Photo src={image.url} className="h-full w-full object-contain" />
    </div>
  );
}

// Which slide is currently centred in the track. Measured from each slide's real on-screen
// position rather than from scrollLeft, because the site is right-to-left: in RTL,
// scrollLeft runs 0, -width, -2*width... so dividing it by the width gives -1 for the
// second photo — an index that doesn't exist — and every photo after the first fell
// back to a default shape. Comparing positions works the same in either direction.
function findActiveIndex(track: HTMLElement): number {
  const trackRect = track.getBoundingClientRect();
  const center = trackRect.left + trackRect.width / 2;
  const slides = track.querySelectorAll<HTMLElement>("[data-slide]");
  let best = 0;
  let bestDistance = Infinity;
  slides.forEach((slide, i) => {
    const r = slide.getBoundingClientRect();
    const distance = Math.abs(r.left + r.width / 2 - center);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  });
  return best;
}

// autoPlay: ms between slides (used for the ads card). Stops for good once the visitor
// swipes, and never runs for people who ask their device for reduced motion.
export function Carousel({ images, autoPlay }: { images: CarouselImage[]; autoPlay?: number }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const userTookOver = useRef(false);
  const [active, setActive] = useState(0);
  const [measured, setMeasured] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!autoPlay || images.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      const el = trackRef.current;
      if (!el || userTookOver.current || document.hidden) return;
      goTo((findActiveIndex(el) + 1) % images.length);
    }, autoPlay);
    return () => window.clearInterval(id);
  }, [autoPlay, images.length]);

  function handleScroll() {
    const el = trackRef.current;
    if (!el) return;
    const next = findActiveIndex(el);
    setActive((prev) => (prev === next ? prev : next));
  }

  function goTo(i: number) {
    const el = trackRef.current;
    const slide = el?.querySelectorAll<HTMLElement>("[data-slide]")[i];
    if (!el || !slide) return;
    // Scroll by the slide's offset from the track — a relative move, so it's correct
    // in RTL and LTR alike.
    const delta = slide.getBoundingClientRect().left - el.getBoundingClientRect().left;
    el.scrollBy({ left: delta, behavior: "smooth" });
  }

  if (images.length === 0) return null;

  const safeActive = Math.min(Math.max(active, 0), images.length - 1);
  const activeImage = images[safeActive];
  const ratio =
    (typeof activeImage?.ratio === "number" ? activeImage.ratio : null) ??
    measured[safeActive] ??
    0.8;

  return (
    <div>
      <div
        ref={trackRef}
        onScroll={handleScroll}
        onPointerDown={() => {
          userTookOver.current = true;
        }}
        style={{ aspectRatio: `1 / ${ratio}` }}
        className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto transition-[aspect-ratio] duration-300 ease-out"
      >
        {images.map((img, i) => (
          <Slide
            key={img.url}
            image={img}
            onMeasured={(r) => setMeasured((prev) => ({ ...prev, [i]: r }))}
          />
        ))}
      </div>
      {images.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                userTookOver.current = true;
                goTo(i);
              }}
              aria-label={`صورة ${i + 1} من ${images.length}`}
              className={`h-1.5 rounded-full transition-all ${
                i === safeActive ? "w-4 bg-primary" : "w-1.5 bg-primary/30"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
