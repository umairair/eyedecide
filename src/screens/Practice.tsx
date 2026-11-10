import { useEffect, useState } from "react";
import type { Side } from "../core/dwell";
import { sounds } from "../core/sound";
import { Half, Split } from "../ui";
import { useBinaryChoice, useSettings } from "../hooks";

type Phase = Side | "done";

/** after this long without a pick, offer a way out */
const STUCK_MS = 14000;

/**
 * One-time lesson before the first game: pick the left side, then the right,
 * by looking. Teaches "look and hold" with nothing at stake, and proves the
 * calibration works before any real question.
 */
export function Practice(props: { onDone: () => void; onRecalibrate: () => void }) {
  const { settings } = useSettings();
  const [phase, setPhase] = useState<Phase>("left");
  const [oops, setOops] = useState(false);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    setStuck(false);
    if (phase === "done") {
      const t = window.setTimeout(props.onDone, 2200);
      return () => clearTimeout(t);
    }
    const t = window.setTimeout(() => setStuck(true), STUCK_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const choice = useBinaryChoice(phase !== "done", (side) => {
    if (side !== phase) {
      setOops(true);
      return;
    }
    setOops(false);
    if (settings.sound) sounds.correct();
    setPhase(side === "left" ? "right" : "done");
  });

  const panel = (side: Side) => {
    const target = phase === side;
    const doneSide = phase === "done" || (side === "left" && phase === "right");
    return (
      <Half
        side={side}
        panelRef={side === "left" ? choice.leftRef : choice.rightRef}
        focused={choice.zone === side}
        label={`${side} side`}
        onClick={() => choice.choose(side)}
        dim={!target && !doneSide}
        hint={target}
        result={doneSide ? "correct" : null}
      >
        <span className="practice__arrow" aria-hidden>
          {side === "left" ? "←" : "→"}
        </span>
        <span className="practice__label">{doneSide ? "Done!" : target ? "Look here" : ""}</span>
      </Half>
    );
  };

  return (
    <Split className="practice" color="#a855f7">
      <header className="practice__head">
        <span className="chip">Practice</span>
        <h2 className="title1">
          {phase === "done"
            ? "You've got it!"
            : oops
              ? `Other side. Look at the ${phase} side`
              : `Look at the ${phase} side and keep looking`}
        </h2>
        <p className="lead">{phase === "done" ? "That's how you answer. Let's play." : "It fills up as you look. When it's full, it's picked."}</p>
        {stuck && phase !== "done" && (
          <div className="helpbar">
            <span>Not working?</span>
            <button className="btn btn--small" onClick={props.onRecalibrate}>
              Set up again
            </button>
            <button className="link link--big" onClick={() => choice.choose(phase)}>
              Just click it
            </button>
          </div>
        )}
      </header>
      {panel("left")}
      {panel("right")}
    </Split>
  );
}
