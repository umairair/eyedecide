import { Half, Plate, Stage } from "../ui";
import { useBinaryChoice } from "../hooks";

/** Over the game after you hold your eyes shut: the clock waits until you carry on. */
export function Pause(props: { onResume: () => void }) {
  const choice = useBinaryChoice(true, props.onResume, "right");
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="paused">
      <Stage>
        <Plate>
          <span className="note">paused</span>
        </Plate>
        <Half side="right" panelRef={choice.rightRef} focused={choice.zone === "right"} label="resume" onClick={() => choice.choose("right")}>
          <span className="word">resume</span>
        </Half>
      </Stage>
    </div>
  );
}
