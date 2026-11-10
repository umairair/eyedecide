import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Side } from "./core/dwell";
import { hub } from "./tracking/InputHub";

/** Two halves of the screen. Look at one and its card fills up. Full = picked. */
export function Split(props: { children: ReactNode; className?: string; color?: string }) {
  return (
    <main className={`split ${props.className ?? ""}`} style={props.color ? ({ "--c": props.color } as React.CSSProperties) : undefined}>
      {props.children}
    </main>
  );
}

export function Half(props: {
  side: Side;
  panelRef: (el: HTMLElement | null) => void;
  focused: boolean;
  label: string;
  onClick: () => void;
  result?: "correct" | "wrong" | null;
  color?: string;
  dim?: boolean;
  badge?: string;
  /** full-bleed picture area at the top of the card */
  media?: ReactNode;
  /** show "keep looking" while this card fills */
  hint?: boolean;
  children: ReactNode;
}) {
  const { side, panelRef, focused, label, onClick, result, color, dim, badge, media, hint, children } = props;
  return (
    <button
      ref={panelRef}
      type="button"
      aria-label={label}
      onClick={onClick}
      style={color ? ({ "--c": color } as React.CSSProperties) : undefined}
      className={["half", `half--${side}`, focused && "is-focused", result && `is-${result}`, dim && "is-dim"]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={`card ${media ? "card--media" : ""}`}>
        {media && <div className="card__media">{media}</div>}
        <div className="card__body">{children}</div>
        <span className="card__fill" aria-hidden />
        <span className="card__edge" aria-hidden />
        {result && <span className="card__stamp">{result === "correct" ? "✓" : "✗"}</span>}
        {hint && focused && !result && <span className="card__hold">Keep looking…</span>}
        {badge && (
          <span className="card__badge">
            {side === "left" ? `◀ ${badge}` : `${badge} ▶`}
          </span>
        )}
      </div>
    </button>
  );
}

/** The VS badge between the two cards (the original had one too). */
export function Vs({ state }: { state?: "correct" | "wrong" | null }) {
  return (
    <div className={`vs ${state ? `is-${state}` : ""}`} aria-hidden>
      {state === "correct" ? "✓" : state === "wrong" ? "✗" : "VS"}
    </div>
  );
}

export function Hearts({ lives, max = 3 }: { lives: number; max?: number }) {
  return (
    <div className="hearts" aria-label={`${lives} lives`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" className={i < lives ? "heart" : "heart is-lost"} aria-hidden>
          <path d="M12 21s-7.5-4.6-9.6-9.3C1 8.4 3 5 6.4 5c2 0 3.6 1.1 4.6 2.6l1 1.4 1-1.4C14 6.1 15.6 5 17.6 5 21 5 23 8.4 21.6 11.7 19.5 16.4 12 21 12 21z" />
        </svg>
      ))}
    </div>
  );
}

/** Live mirror of the webcam; `oval` adds a face guide that fills as you hold still. */
export function Camera({ ok, oval, progress = 0 }: { ok: boolean; oval?: boolean; progress?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const attach = () => {
      if (hub.stream && v.srcObject !== hub.stream) {
        v.srcObject = hub.stream;
        v.play().catch(() => {});
      }
    };
    attach();
    return hub.onStatus(attach);
  }, []);
  return (
    <div className={`camera ${oval ? "camera--big" : ""} ${ok ? "is-ok" : ""}`} style={{ "--p": progress } as React.CSSProperties}>
      <video ref={ref} muted playsInline aria-label="camera" />
      {oval && <span className="camera__oval" aria-hidden />}
    </div>
  );
}

export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return setShown(value);
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 500);
      setShown(value * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(tick);
      else setShown(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}
