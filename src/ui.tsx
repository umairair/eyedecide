import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Side } from "./core/dwell";
import { hub } from "./tracking/InputHub";

/**
 * Every screen you pick on has the same shape: a choice filling the left half,
 * a choice filling the right half, and a plate across the seam for whatever
 * there is to read. Reading happens in the middle, where looking picks nothing.
 *
 * The halves stay exactly half the screen each. The tracker was tuned and
 * tested with the choices a quarter of the way in from each edge; moving them
 * (say, by giving the middle its own column) makes it learn worse.
 */
export function Stage(props: { children: ReactNode; className?: string }) {
  return <main className={`stage ${props.className ?? ""}`}>{props.children}</main>;
}

/**
 * The plate across the seam: the headline sits at eye level, between the two
 * choices. `foot` is the smaller tab at the bottom of the seam (lives, score).
 */
export function Plate(props: { foot?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="plate">{props.children}</div>
      {props.foot && <div className="foot">{props.foot}</div>}
    </>
  );
}

/**
 * The plate's headline, as big as its longest word allows
 * ("Older?" is huge, "More followers?" has to shrink to fit).
 */
export function Headline({ text, as: Tag = "h2" }: { text: string; as?: "h1" | "h2" }) {
  const longest = Math.max(5, ...text.split(/\s+/).map((w) => w.length));
  return (
    <Tag key={text} className="head" style={{ "--n": longest } as React.CSSProperties}>
      {text}
    </Tag>
  );
}

/** One side of the stage. Look at it and a line runs round its edge. All the way round = picked. */
export function Half(props: {
  side: Side;
  panelRef: (el: HTMLElement | null) => void;
  focused: boolean;
  label: string;
  onClick: () => void;
  result?: "correct" | "wrong" | null;
  /** this side was picked and it was wrong */
  miss?: boolean;
  dim?: boolean;
  /** picture above the words; without one the half is just a word */
  media?: ReactNode;
  children: ReactNode;
}) {
  const { side, panelRef, focused, label, onClick, result, miss, dim, media, children } = props;
  const cls = ["half", `half--${side}`, !media && "half--flat", focused && "is-focused", result && `is-${result}`, miss && "is-miss", dim && "is-dim"];
  return (
    <button ref={panelRef} type="button" aria-label={label} onClick={onClick} className={cls.filter(Boolean).join(" ")}>
      {media ? (
        <>
          <div className="half__media">{media}</div>
          <div className="half__band">{children}</div>
        </>
      ) : (
        children
      )}
      <svg className="frame" aria-hidden>
        <rect pathLength={1} />
      </svg>
    </button>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function Icon({ name, className }: { name: "check" | "cross" | "left" | "right" | "up" | "gear"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
      {name === "check" && <path d="M4.5 12.5l5 5 10-11" />}
      {name === "cross" && <path d="M6 6l12 12M18 6L6 18" />}
      {name === "left" && <path d="M20 12H4m7-7l-7 7 7 7" />}
      {name === "right" && <path d="M4 12h16m-7-7l7 7-7 7" />}
      {name === "up" && <path d="M12 20V4m-7 7l7-7 7 7" />}
      {name === "gear" && (
        <path d="M4 8h9m4 0h3M4 16h3m4 0h9M15 5.5v5M9 13.5v5" />
      )}
    </svg>
  );
}

/** Lives left: lit dots. */
export function Lives({ lives, max = 3 }: { lives: number; max?: number }) {
  return (
    <div className="lives" role="img" aria-label={`${lives} lives`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < lives ? "" : "is-lost"} />
      ))}
    </div>
  );
}

/** Live mirror of the webcam; `oval` adds a face guide and a bar that fills as you hold still. */
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
    <div className={`camera ${ok ? "is-ok" : ""}`} style={{ "--p": progress } as React.CSSProperties}>
      <video ref={ref} muted playsInline aria-label="camera" />
      {oval && <span className="camera__oval" aria-hidden />}
      {oval && <span className="camera__bar" aria-hidden />}
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
      const k = Math.max(0, Math.min(1, (t - start) / 500));
      setShown(value * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(tick);
      else setShown(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}
