import { useEffect, useState } from "react";
import type { RecalReason } from "../core/watchdog";
import { Calibrate } from "./Calibrate";

const COUNTDOWN = 3;

/** why setup is running again: the watchdog's verdict, or the player asked for it */
export type SetupReason = RecalReason | "asked";

/**
 * Shown over whatever you're doing when the calibration stops fitting (you
 * sat up, moved the laptop…) or when you ask to set up again. A short notice
 * (skipped if you asked), then the usual setup; the game underneath is paused
 * and carries on afterwards, streak and all.
 */
export function Recalibrate(props: { reason: SetupReason; onDone: () => void; onKeys: () => void; onSnooze: () => void }) {
  const [phase, setPhase] = useState<"notice" | "setup">(props.reason === "asked" ? "setup" : "notice");
  const [count, setCount] = useState(COUNTDOWN);

  useEffect(() => {
    if (phase !== "notice") return;
    if (count <= 0) return setPhase("setup");
    const t = window.setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="set up again">
      {phase === "notice" ? (
        <main className="page">
          <h2 className="head">{props.reason === "moved" ? "you moved" : "recalibrating"}</h2>
          <button className="btn" onClick={() => setPhase("setup")} autoFocus>
            redo setup {count}
          </button>
          <button className="link" onClick={props.onSnooze}>
            not now
          </button>
        </main>
      ) : (
        <Calibrate onDone={props.onDone} onKeys={props.onKeys} />
      )}
    </div>
  );
}
