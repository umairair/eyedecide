import { useEffect, useState } from "react";
import type { Side } from "../core/dwell";
import { sounds } from "../core/sound";
import { Half, Headline, Icon, Plate, Stage } from "../ui";
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
      const t = window.setTimeout(props.onDone, 1400);
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
    const passed = phase === "done" || (side === "left" && phase === "right");
    return (
      <Half
        side={side}
        panelRef={side === "left" ? choice.leftRef : choice.rightRef}
        focused={choice.zone === side}
        label={`${side} side`}
        onClick={() => choice.choose(side)}
        dim={!target && !passed}
        result={passed ? "correct" : null}
      >
        <Icon name={passed ? "check" : side} className="glyph" />
      </Half>
    );
  };

  return (
    <Stage className="practice">
      <Plate
        foot={
          stuck &&
          phase !== "done" && (
            <div className="help">
              <button className="btn btn--small btn--line" onClick={props.onRecalibrate}>
                redo setup
              </button>
              <button className="link" onClick={props.onDone}>
                skip
              </button>
            </div>
          )
        }
      >
        <Headline text={phase === "done" ? "nice" : oops ? "other side" : `look ${phase}`} />
      </Plate>
      {panel("left")}
      {panel("right")}
    </Stage>
  );
}
