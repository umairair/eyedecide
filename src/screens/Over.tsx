import { sounds } from "../core/sound";
import { Half, Plate, Stage } from "../ui";
import { useBinaryChoice, useSettings } from "../hooks";

export function Over(props: { score: number; best: number; newBest: boolean; onMenu: () => void; onAgain: () => void }) {
  const { settings } = useSettings();
  const choice = useBinaryChoice(true, (side) => {
    if (settings.sound) sounds.pick();
    side === "left" ? props.onMenu() : props.onAgain();
  });

  return (
    <Stage className="over">
      <Plate>
        <div className="score score--big">
          <b>{props.score}</b>
        </div>
        <span className={`label ${props.newBest ? "is-new" : ""}`}>{props.newBest ? "new best" : `best ${props.best}`}</span>
      </Plate>
      <Half side="left" panelRef={choice.leftRef} focused={choice.zone === "left"} label="menu" onClick={() => choice.choose("left")}>
        <span className="word">menu</span>
      </Half>
      <Half side="right" panelRef={choice.rightRef} focused={choice.zone === "right"} label="play again" onClick={() => choice.choose("right")}>
        <span className="word">again</span>
      </Half>
    </Stage>
  );
}
