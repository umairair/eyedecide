import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { DwellMachine, type Side } from "./core/dwell";
import type { RecalReason } from "./core/watchdog";
import { load, save } from "./core/storage";
import { hub } from "./tracking/InputHub";

export interface Settings {
  dwellMs: number;
  deadZone: number;
  smoothing: number;
  sound: boolean;
  preview: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  dwellMs: 1100,
  deadZone: 0.3,
  smoothing: 0.5,
  sound: true,
  preview: true,
};

const SETTINGS_KEY = "settings.v2";

const SettingsCtx = createContext<{
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}>({ settings: DEFAULT_SETTINGS, update: () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...load(SETTINGS_KEY, DEFAULT_SETTINGS) }));
  useEffect(() => {
    save(SETTINGS_KEY, settings);
    hub.setSmoothing(settings.smoothing);
  }, [settings]);
  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  return <SettingsCtx.Provider value={{ settings, update }}>{children}</SettingsCtx.Provider>;
}

export const useSettings = () => useContext(SettingsCtx);

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

/**
 * Tracking health for the status light: "ok", "degraded" (a sensor is out or
 * the signal is shaky, so picks wait until sure), or null when not tracking.
 * Changes only after holding for a second, so the light doesn't flicker.
 */
export function useTrackingHealth(enabled: boolean) {
  const [health, setHealth] = useState<"ok" | "degraded" | null>(null);
  useEffect(() => {
    if (!enabled) {
      setHealth(null);
      return;
    }
    let shown: "ok" | "degraded" | null = null;
    let pending: "ok" | "degraded" | null = null;
    let since = 0;
    return hub.subscribe((f) => {
      if (!f.face || !hub.calibration) return;
      if (f.health !== pending) {
        pending = f.health;
        since = f.t;
      }
      if (pending !== shown && (shown === null || f.t - since >= 1000)) setHealth((shown = pending));
    });
  }, [enabled]);
  return health;
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
 * Fed by gaze dwell, the arrow keys, or a click (via `choose`).
 *
 * Dwell progress is written straight to each panel's `--p` CSS variable
 * instead of React state, so a tracked frame never re-renders the screen.
 * React only hears about it when the focused side changes.
 */
export function useBinaryChoice(
  active: boolean,
  onChoose: (side: Side) => void,
  scale?: Partial<Record<Side, number>>,
) {
  const { settings } = useSettings();
  const [zone, setZone] = useState<Side | null>(null);
  const cb = useRef(onChoose);
  cb.current = onChoose;
  const els = useRef<Record<Side, HTMLElement | null>>({ left: null, right: null });
  const scaleKey = `${scale?.left ?? 1}:${scale?.right ?? 1}`;

  useEffect(() => {
    const paint = (l: number, r: number) => {
      els.current.left?.style.setProperty("--p", l.toFixed(3));
      els.current.right?.style.setProperty("--p", r.toFixed(3));
    };
    paint(0, 0);
    setZone(null);
    if (!active) return;

    const [sl, sr] = scaleKey.split(":").map(Number);
    // a shaky calibration (heavy breathing, a wobbly lap) gets a wider middle,
    // so wobble alone can't reach a side
    const noise = hub.calibration?.noise ?? 0;
    const machine = new DwellMachine({
      dwellMs: settings.dwellMs,
      deadZone: Math.max(settings.deadZone, Math.min(0.45, 2.5 * noise)),
      scale: { left: sl, right: sr },
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
      if (r.zone !== lastZone) setZone((lastZone = r.zone));
      if (r.armed !== lastArmed) document.body.dataset.armed = String((lastArmed = r.armed));
      if (r.committed) {
        hub.learn(r.committed, "gaze");
        cb.current(r.committed);
      }
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea, dialog")) return;
      const side: Side | null = e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right" : null;
      if (!side) return;
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
  }, [active, settings.dwellMs, settings.deadZone, scaleKey]);

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
