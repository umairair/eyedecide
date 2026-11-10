import { Half, Plate, Stage } from "../ui";
import { useBinaryChoice } from "../hooks";

/** Over the game after you hold your eyes shut: leave, or carry on. */
export function Pause(props: { onMenu: () => void; onResume: () => void }) {
  const choice = useBinaryChoice(true, (side) => {
    side === "left" ? props.onMenu() : props.onResume();
  });
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="paused">
      <Stage>
        <Plate>
          <span className="note">paused</span>
        </Plate>
        <Half side="left" panelRef={choice.leftRef} focused={choice.zone === "left"} label="menu" onClick={() => choice.choose("left")}>
          <span className="word">menu</span>
        </Half>
        <Half side="right" panelRef={choice.rightRef} focused={choice.zone === "right"} label="resume" onClick={() => choice.choose("right")}>
          <span className="word">resume</span>
        </Half>
      </Stage>
    </div>
  );
}
