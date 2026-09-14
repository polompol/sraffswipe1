import { useEffect, useState } from "react";
import { IconBack, IconChevronRight } from "@/components/Icons";
import { haptic } from "@/telegram/sdk";

/** Явное листание не конфликтует со свайпом отклика и переворотом карточки. */
export function SwipePhoto({ photos, label, initial, top = true, hasHero, onHero }: {
  photos: string[];
  label: string;
  initial: string;
  top?: boolean;
  hasHero?: boolean;
  onHero?: (shown: boolean) => void;
}) {
  const urls = [...new Set(photos.filter(Boolean))].slice(0, 5);
  const [selected, setSelected] = useState("");
  const src = urls.includes(selected) ? selected : urls[0];
  const index = Math.max(0, urls.indexOf(src));
  const [image, setImage] = useState({ src: "", state: "load" });
  const state = image.src === src ? image.state : "load";
  const showHero = !!hasHero && (!src || state === "err");
  useEffect(() => onHero?.(showHero), [showHero, onHero]);

  function move(delta: number) {
    setSelected(urls[(index + delta + urls.length) % urls.length]);
    haptic("select");
  }

  return (
    <div className="swipe-photo swipe-photo-fallback">
      <span aria-hidden className={`swipe-initial ${showHero ? "swipe-initial-ghost" : ""}`}>{initial}</span>
      {src && state === "load" && <div className="photo-shimmer" />}
      {src && state !== "err" && <img key={src} src={src} alt={`${label} — фото ${index + 1}`}
        className="swipe-img" loading={top ? "eager" : "lazy"} draggable={false}
        style={{ opacity: state === "ok" ? 1 : 0 }}
        onLoad={() => setImage({ src, state: "ok" })}
        onError={() => setImage({ src, state: "err" })} />}
      {urls.length > 1 && <div className="photo-gallery-controls" aria-hidden={!top}
        onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Предыдущее фото" tabIndex={top ? 0 : -1} onClick={() => move(-1)}><IconBack size={19} /></button>
        <output aria-live={top ? "polite" : "off"} aria-label="Номер фото">{index + 1} / {urls.length}</output>
        <button type="button" aria-label="Следующее фото" tabIndex={top ? 0 : -1} onClick={() => move(1)}><IconChevronRight size={19} /></button>
      </div>}
    </div>
  );
}
