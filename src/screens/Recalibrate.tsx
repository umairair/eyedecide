import { useEffect, useState } from "react";
import type { RecalReason } from "../core/watchdog";
import { Calibrate } from "./Calibrate";

const COUNTDOWN = 3;

/**
 * Shown over whatever you're doing when the calibration stops fitting (you
 * sat up, moved the laptop…). A short notice, then the usual setup; the game
 * underneath is paused and carries on afterwards, streak and all.
 */
export function Recalibrate(props: { reason: RecalReason; onDone: () => void; onKeys: () => void; onSnooze: () => void }) {
  const [phase, setPhase] = useState<"notice" | "setup">("notice");
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
        <main className="center setup">
          <div className="bigicon" aria-hidden>
            ↻
          </div>
          <h2 className="title1">{props.reason === "moved" ? "You moved" : "Tracking slipped"}</h2>
          <p className="lead">Quick setup again so it stays accurate. Your game is paused.</p>
          <button className="btn btn--big" onClick={() => setPhase("setup")} autoFocus>
            Start ({count})
          </button>
          <button className="link link--big" onClick={props.onSnooze}>
            Not now
          </button>
        </main>
      ) : (
        <Calibrate onDone={props.onDone} onKeys={props.onKeys} />
      )}
    </div>
  );
}
