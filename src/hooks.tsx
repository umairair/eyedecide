import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DwellMachine, type Side } from "./core/dwell";
import type { RecalReason } from "./core/watchdog";
import { hub } from "./tracking/InputHub";

/** how long a look has to hold to pick */
const DWELL_MS = 1100;
/** how far from the middle a look has to be to count as a side (the setup dots are ±1) */
const DEAD_ZONE = 0.3;
// 0 = raw and twitchy, 1 = smooth and a little late
hub.setSmoothing(0.5);

export function useCameraStatus() {
  return useSyncExternalStore(
    (cb) => hub.onStatus(cb),
    () => hub.status,
  );
}

/** True once the face has been out of view for `graceMs`. */
export function useFaceLost(enabled: boolean, graceMs = 600) {
  const [lost, setLost] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setLost(false);
      return;
    }
    let lastSeen = performance.now();
    const id = window.setInterval(() => setLost(performance.now() - lastSeen > graceMs), 150);
    const unsub = hub.subscribe((f) => {
      if (f.face) lastSeen = f.t;
    });
    return () => {
      clearInterval(id);
      unsub();
    };
  }, [enabled, graceMs]);
  return lost;
}

/** Why the calibration needs redoing, as soon as the tracker's watchdog says so; null otherwise. */
export function useRecalNeeded(enabled: boolean) {
  const [reason, setReason] = useState<RecalReason | null>(null);
  useEffect(() => {
    setReason(null);
    if (!enabled) return;
    let shown: RecalReason | null = null;
    return hub.subscribe((f) => {
      if (f.recal !== shown) setReason((shown = f.recal));
    });
  }, [enabled]);
  return reason;
}

type PanelRef = (el: HTMLElement | null) => void;

/**
 * The one input primitive the whole app is built on: a left/right choice.
 * Fed by gaze dwell, the arrow keys, or a click (via `choose`). With `only`,
 * there is a single thing to pick and the other side does nothing.
 *
 * Dwell progress is written straight to each panel's `--p` CSS variable
 * instead of React state, so a tracked frame never re-renders the screen.
 * React only hears about it when the focused side changes.
 */
export function useBinaryChoice(
  active: boolean,
  onChoose: (side: Side) => void,
  only?: Side,
) {
  const [zone, setZone] = useState<Side | null>(null);
  const cb = useRef(onChoose);
  cb.current = onChoose;
  const els = useRef<Record<Side, HTMLElement | null>>({ left: null, right: null });

  useEffect(() => {
    const paint = (l: number, r: number) => {
      els.current.left?.style.setProperty("--p", l.toFixed(3));
      els.current.right?.style.setProperty("--p", r.toFixed(3));
    };
    paint(0, 0);
    setZone(null);
    if (!active) return;

    // a shaky calibration (heavy breathing, a wobbly lap) gets a wider middle,
    // so wobble alone can't reach a side
    const noise = hub.calibration?.noise ?? 0;
    const machine = new DwellMachine({
      dwellMs: DWELL_MS,
      deadZone: Math.max(DEAD_ZONE, Math.min(0.45, 2.5 * noise)),
      scale: only && { [only === "left" ? "right" : "left"]: Infinity },
      requireCenter: true,
    });
    let last = performance.now();
    let lastZone: Side | null = null;
    let lastArmed: boolean | null = null;
    const unsub = hub.subscribe((f) => {
      const dt = Math.max(0, Math.min(100, f.t - last));
      last = f.t;
      const r = machine.update(f.s, dt, f.sigma); // s is null when the face is missing: progress freezes
      paint(r.left, r.right);
      const zone = only && r.zone !== only ? null : r.zone;
      if (zone !== lastZone) setZone((lastZone = zone));
      if (r.armed !== lastArmed) document.body.dataset.armed = String((lastArmed = r.armed));
      if (r.committed) {
        hub.learn(r.committed, "gaze");
        cb.current(r.committed);
      }
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      // a re-setup is covering this screen: don't answer the question hidden underneath
      if (hub.paused) return;
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea, dialog")) return;
      const side: Side | null = e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right" : null;
      if (!side || (only && side !== only)) return;
      hub.learn(side, "manual");
      cb.current(side);
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unsub();
      window.removeEventListener("keydown", onKey);
      delete document.body.dataset.armed;
    };
  }, [active, only]);

  const choose = useCallback(
    (side: Side) => {
      if (!active) return;
      hub.learn(side, "manual");
      cb.current(side);
    },
    [active],
  );
  const leftRef = useCallback<PanelRef>((el) => void (els.current.left = el), []);
  const rightRef = useCallback<PanelRef>((el) => void (els.current.right = el), []);
  return { zone, choose, leftRef, rightRef };
}
